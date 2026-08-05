import { describe, it, expect } from 'vitest';
import {
  asUUID, asHash, asISOTimestamp, asVersion, asSnapshotId, asCorrelationId,
  CONTRACTS_SCHEMA_VERSION,
  type EventEnvelope, type ProductionSnapshot, type DecisionRecord,
} from '@genesis/contracts';

describe('contracts base', () => {
  it('constructs an EventEnvelope with required metadata', () => {
    const e: EventEnvelope<{ v: number }> = {
      event_id: asUUID('e1'),
      event_type: 'Test',
      event_time: asISOTimestamp('2026-07-28T00:00:00.000Z'),
      ingest_time: asISOTimestamp('2026-07-28T00:00:00.100Z'),
      seq: 1,
      source_engine: 'test',
      schema_version: CONTRACTS_SCHEMA_VERSION,
      correlation_id: asCorrelationId('c1'),
      payload: { v: 1 },
      hash: asHash('h1'),
    };
    expect(e.event_id).toBe('e1');
    expect(e.correlation_id).toBe('c1');
  });

  it('DecisionRecord back-traces to source events', () => {
    const d: DecisionRecord = {
      decision_id: asUUID('d1'),
      correlation_id: asCorrelationId('c1'),
      event_time: asISOTimestamp('2026-07-28T00:00:00.000Z'),
      decided_at: asISOTimestamp('2026-07-28T00:00:00.050Z'),
      engine_version: asVersion('0.0.0'),
      snapshot_id: asSnapshotId('s1'),
      data_snapshot_ref: asHash('dh1'),
      schema_version: CONTRACTS_SCHEMA_VERSION,
      source_event_ids: [asUUID('e1')],
      outcome: { action: 'hold', reason: 'S0 base test' },
      hash: asHash('dh2'),
    };
    expect(d.source_event_ids.length).toBe(1);
    expect(d.outcome.action).toBe('hold');
  });

  it('Snapshot pins decision-affecting versions (base shape)', () => {
    const s: Pick<ProductionSnapshot, 'snapshot_id' | 'rng'> = {
      snapshot_id: asSnapshotId('s1'),
      rng: 'none',
    };
    expect(s.rng).toBe('none');
  });
});
