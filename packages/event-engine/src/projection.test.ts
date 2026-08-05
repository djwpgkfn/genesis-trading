import { describe, it, expect } from 'vitest';
import { InMemoryEventStore } from './event-store.js';
import { ProjectionEngine, type Projection } from './projection.js';
import { projectDecision } from './decision-projection.js';
import { EventTypes, type EventInput } from './events.js';
import { asUUID, asISOTimestamp, asSnapshotId, asCorrelationId } from '@genesis/contracts';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());
const ev = (type: string, n: number, payload: unknown): EventInput => ({
  event_id: asUUID(`e${n}`), event_type: type, event_time: iso(n * 1000), ingest_time: iso(n * 1000),
  source_engine: 't', schema_version: 1, correlation_id: asCorrelationId('c1'), snapshot_id: asSnapshotId('s1'), payload,
});
const counter: Projection<number> = { name: 'c', version: '1', initial: () => 0, apply: (s) => s + 1 };

describe('projection engine', () => {
  it('delete + rebuild == build (INV-E4)', () => {
    const s = new InMemoryEventStore();
    s.append(ev(EventTypes.DecisionStage, 1, {}));
    s.append(ev(EventTypes.DecisionOutcome, 2, { action: 'buy', reason: 'ok' }));
    const eng = new ProjectionEngine();
    const a = eng.build(s.all(), counter);
    const b = eng.rebuild(s.all(), counter);
    expect(a).toBe(2);
    expect(b).toBe(a);
  });
  it('DecisionRecord is a back-traceable projection', () => {
    const s = new InMemoryEventStore();
    s.append(ev(EventTypes.DecisionStage, 1, {}));
    s.append(ev(EventTypes.DecisionOutcome, 2, { action: 'sell', reason: 'stop' }));
    const dec = projectDecision(s.byCorrelation('c1'))!;
    expect(dec.outcome).toEqual({ action: 'sell', reason: 'stop' });
    expect(dec.source_event_ids).toHaveLength(2);
  });
});
