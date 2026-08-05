import {
  runPipeline,
  projectDecision,
  type EventStore,
  type StoredEvent,
  type Projection,
  type UpcasterRegistry,
  type EventInput,
} from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import type { DecisionRecord } from '@genesis/contracts';
import { ReplaySession } from './session.js';
import { ReplayEventTypes } from './replay-events.js';
import type { EventRange, ReplayReason } from './types.js';

export interface CreateSessionOpts {
  snapshot_id: string;
  replay_reason: ReplayReason;
  replay_speed?: number;
  range?: EventRange; // by seq
  asOfEventMs?: number; // OR point-in-time (event_time)
}

let counter = 0;

/**
 * ReplayEngine reconstructs past state from Snapshot + Event Log using the SAME
 * `runPipeline` as Live. It NEVER passes an externalSink → structurally side-effect-free
 * (INV-E3). Reusable by AI Layer, UI Replay Mode, and Explainability View.
 */
export class ReplayEngine {
  constructor(
    private readonly sourceLog: EventStore, // the log to replay
    private readonly replayLog: EventStore, // where replay's OWN events are recorded
    private readonly now: () => string = () => new Date(0).toISOString(),
    private readonly upcaster?: UpcasterRegistry,
  ) {}

  /** Build the replay slice: by seq range, or as-of event_time (point-in-time). */
  private slice(opts: CreateSessionOpts): { events: StoredEvent[]; range: EventRange } {
    let events = [...this.sourceLog.all()];
    if (opts.asOfEventMs !== undefined) {
      events = events.filter((e) => Date.parse(String(e.event_time)) <= opts.asOfEventMs!);
    }
    if (opts.range) {
      events = events.filter((e) => e.seq >= opts.range!.fromSeq && e.seq <= opts.range!.toSeq);
    }
    const range: EventRange = {
      fromSeq: events.length ? events[0]!.seq : 0,
      toSeq: events.length ? events[events.length - 1]!.seq : 0,
    };
    return { events, range };
  }

  private emit(type: string, session_id: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`re-${session_id}-${type}`),
      event_type: type,
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'replay-engine',
      schema_version: 1,
      correlation_id: asCorrelationId(session_id),
      snapshot_id: asSnapshotId('replay'),
      payload,
    };
    this.replayLog.append(input);
  }

  createSession(opts: CreateSessionOpts): ReplaySession {
    const { events, range } = this.slice(opts);
    const session_id = `replay-${++counter}`;
    const speed = opts.replay_speed ?? 1;
    const s = new ReplaySession(
      session_id,
      opts.snapshot_id,
      events,
      range,
      speed,
      opts.replay_reason,
      this.now,
    );
    s.begin();
    this.emit(ReplayEventTypes.Started, session_id, {
      session_id,
      snapshot_id: opts.snapshot_id,
      fromSeq: range.fromSeq,
      toSeq: range.toSeq,
      replay_speed: speed,
      replay_reason: opts.replay_reason,
    });
    return s;
  }

  pause(s: ReplaySession): void {
    s.pause();
    this.emit(ReplayEventTypes.Paused, s.session_id, {
      session_id: s.session_id,
      at_seq: s.currentSeq,
    });
  }
  resume(s: ReplaySession): void {
    s.resume();
    this.emit(ReplayEventTypes.Resumed, s.session_id, {
      session_id: s.session_id,
      at_seq: s.currentSeq,
    });
  }
  seek(s: ReplaySession, toSeq: number): void {
    const from = s.currentSeq;
    s.seek(toSeq);
    this.emit(ReplayEventTypes.Seeked, s.session_id, {
      session_id: s.session_id,
      from_seq: from,
      to_seq: toSeq,
    });
  }

  /** Run to the end. Uses runPipeline (no externalSink) → no external effects (INV-E3). */
  runToEnd(s: ReplaySession): void {
    try {
      while (s.applyNext() !== null) {
        /* stepping; speed is a UI hint, not correctness */
      }
      this.emit(ReplayEventTypes.Finished, s.session_id, {
        session_id: s.session_id,
        final_state_hash: s.stateHash ?? '',
        applied: s.appliedEvents.length,
      });
    } catch (err) {
      s.fail(String(err));
      this.emit(ReplayEventTypes.Failed, s.session_id, {
        session_id: s.session_id,
        at_seq: s.currentSeq,
        error: String(err),
      });
    }
  }

  /** Reconstruct a projection over the applied events — SAME pipeline as Live. */
  project<S>(s: ReplaySession, projection: Projection<S>): S {
    return this.upcaster
      ? runPipeline(s.appliedEvents, projection, { upcaster: this.upcaster })
      : runPipeline(s.appliedEvents, projection);
  }

  /** DecisionRecords produced during the replayed window (same as Live). */
  decisions(s: ReplaySession): DecisionRecord[] {
    const byCorr = new Map<string, StoredEvent[]>();
    for (const e of s.appliedEvents) {
      const arr = byCorr.get(String(e.correlation_id)) ?? [];
      arr.push(e);
      byCorr.set(String(e.correlation_id), arr);
    }
    const out: DecisionRecord[] = [];
    for (const evs of byCorr.values()) {
      const d = projectDecision(evs);
      if (d) out.push(d);
    }
    return out;
  }

  /** Explainability timeline for one decision cycle (for the Explainability View). */
  explainability(s: ReplaySession, correlationId: string): readonly StoredEvent[] {
    return s.appliedEvents.filter((e) => String(e.correlation_id) === correlationId);
  }
}
