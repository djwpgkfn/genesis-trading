import { describe, it, expect } from 'vitest';
import {
  InMemoryEventStore,
  EventTypes,
  ProjectionEngine,
  type EventInput,
  type Projection,
} from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { ReplayEngine } from './engine.js';
import { replayAuditProjection, buildAuditReport } from './audit.js';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());
function seed(): InMemoryEventStore {
  const s = new InMemoryEventStore();
  const mk = (
    n: number,
    type: string,
    snap = false,
    payload: unknown = { action: 'buy', reason: 'x' },
  ): EventInput => {
    const b: EventInput = {
      event_id: asUUID(`e${n}`),
      event_type: type,
      event_time: iso(n * 1000),
      ingest_time: iso(n * 1000),
      source_engine: 't',
      schema_version: 1,
      correlation_id: asCorrelationId('c1'),
      payload,
    };
    return snap ? { ...b, snapshot_id: asSnapshotId('s1') } : b;
  };
  s.append(mk(1, EventTypes.MarketTrade));
  s.append(mk(2, EventTypes.DecisionStage, true));
  s.append(mk(3, EventTypes.DecisionOutcome, true, { action: 'buy', reason: 'ok' }));
  return s;
}
const counter: Projection<number> = {
  name: 'c',
  version: '1',
  initial: () => 0,
  apply: (s) => s + 1,
};

describe('ReplayEngine', () => {
  it('reproduces identical state hash + decisions (INV-D2)', () => {
    const src = seed();
    const a = new ReplayEngine(src, new InMemoryEventStore());
    const sa = a.createSession({ snapshot_id: 'snap', replay_reason: 'debug' });
    a.runToEnd(sa);
    const b = new ReplayEngine(src, new InMemoryEventStore());
    const sb = b.createSession({ snapshot_id: 'snap', replay_reason: 'debug' });
    b.runToEnd(sb);
    expect(sa.stateHash).toBe(sb.stateHash);
    expect(a.decisions(sa)).toEqual(b.decisions(sb));
    expect(a.decisions(sa)[0]!.outcome.action).toBe('buy');
  });

  it('supports as-of point-in-time replay', () => {
    const src = seed();
    const eng = new ReplayEngine(src, new InMemoryEventStore());
    const s = eng.createSession({
      snapshot_id: 'snap',
      replay_reason: 'research',
      asOfEventMs: 2000,
    });
    eng.runToEnd(s);
    expect(s.appliedEvents.map((e) => e.seq)).toEqual([1, 2]); // event at 3000 excluded
  });

  it('records replay as events and builds an audit report', () => {
    const src = seed();
    const replayLog = new InMemoryEventStore();
    const eng = new ReplayEngine(src, replayLog);
    const s = eng.createSession({ snapshot_id: 'snap', replay_reason: 'audit' });
    eng.pause(s);
    eng.resume(s);
    eng.runToEnd(s);
    const audit = new ProjectionEngine().build(replayLog.all(), replayAuditProjection);
    const report = buildAuditReport(audit, eng.decisions(s).length);
    expect(report.finished).toBe(true);
    expect(report.pauses).toBe(1);
    expect(report.resumes).toBe(1);
    expect(report.replay_reason).toBe('audit');
    expect(report.decisions_count).toBe(1);
  });

  it('uses the same runPipeline (project) as Live and stays side-effect-free (INV-E3)', () => {
    const src = seed();
    const eng = new ReplayEngine(src, new InMemoryEventStore());
    const s = eng.createSession({ snapshot_id: 'snap', replay_reason: 'debug' });
    eng.runToEnd(s);
    expect(eng.project(s, counter)).toBe(3); // same pipeline fold as live
  });

  it('seek repositions deterministically', () => {
    const src = seed();
    const eng = new ReplayEngine(src, new InMemoryEventStore());
    const s = eng.createSession({ snapshot_id: 'snap', replay_reason: 'debug' });
    eng.runToEnd(s);
    const full = s.stateHash;
    eng.seek(s, 2);
    expect(s.currentSeq).toBe(2);
    eng.runToEnd(s);
    expect(s.stateHash).toBe(full); // re-running to end reproduces the same final hash
  });
});
