import { chainHash, contentHash, type StoredEvent } from '@genesis/event-engine';
import type { EventRange, ReplayReason, ReplaySessionSnapshot, ReplayStatus } from './types.js';

/** Deterministic rolling state hash over applied event hashes (INV-D2). */
function foldHash(events: readonly StoredEvent[], upToIdx: number): string | undefined {
  if (upToIdx < 0) return undefined;
  let h: string | undefined;
  for (let i = 0; i <= upToIdx; i++) h = chainHash(h, contentHash(events[i]!.hash));
  return h;
}

/**
 * Independent replay session over a fixed slice of the event log. Deterministic: the same
 * snapshot_id + slice always yields the same state hash sequence. Controls (pause/resume/seek)
 * mutate only cursor/status; they never touch the event log or cause external effects.
 */
export class ReplaySession {
  private idx = -1; // index of last applied event within `slice`
  private status: ReplayStatus = 'created';
  private started_at?: string;
  private finished_at?: string;

  constructor(
    readonly session_id: string,
    readonly snapshot_id: string,
    private readonly slice: readonly StoredEvent[],
    readonly range: EventRange,
    readonly replay_speed: number,
    readonly replay_reason: ReplayReason,
    private readonly now: () => string,
  ) {}

  begin(): void {
    this.status = 'running';
    this.started_at = this.now();
  }

  /** Apply the next event; returns it, or null at end (then marks finished). */
  applyNext(): StoredEvent | null {
    if (this.idx + 1 >= this.slice.length) {
      this.finish();
      return null;
    }
    this.idx++;
    return this.slice[this.idx]!;
  }

  seek(toSeq: number): void {
    // Re-fold deterministically to the target position (idempotent, reproducible).
    const target = this.slice.findIndex((e) => e.seq === toSeq);
    this.idx = target; // -1 if not found → before start
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }
  resume(): void {
    if (this.status === 'paused') this.status = 'running';
  }
  fail(_error: string): void {
    this.status = 'failed';
    this.finished_at = this.now();
  }
  private finish(): void {
    if (this.status !== 'finished') {
      this.status = 'finished';
      this.finished_at = this.now();
    }
  }

  get currentSeq(): number {
    return this.idx >= 0 ? this.slice[this.idx]!.seq : this.range.fromSeq - 1;
  }
  get currentEvent(): StoredEvent | undefined {
    return this.idx >= 0 ? this.slice[this.idx] : undefined;
  }
  get stateHash(): string | undefined {
    return foldHash(this.slice, this.idx);
  }
  get appliedEvents(): readonly StoredEvent[] {
    return this.slice.slice(0, this.idx + 1);
  }
  get isDone(): boolean {
    return this.status === 'finished' || this.status === 'failed';
  }

  toSnapshot(): ReplaySessionSnapshot {
    const base: ReplaySessionSnapshot = {
      session_id: this.session_id,
      snapshot_id: this.snapshot_id,
      event_range: this.range,
      replay_speed: this.replay_speed,
      status: this.status,
      current_seq: this.currentSeq,
      replay_reason: this.replay_reason,
    };
    const cur = this.currentEvent;
    const sh = this.stateHash;
    return {
      ...base,
      ...(cur ? { current_event_id: String(cur.event_id) } : {}),
      ...(sh ? { current_state_hash: sh } : {}),
      ...(this.started_at ? { started_at: this.started_at } : {}),
      ...(this.finished_at ? { finished_at: this.finished_at } : {}),
    };
  }
}
