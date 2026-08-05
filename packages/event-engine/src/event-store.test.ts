import { describe, it, expect } from 'vitest';
import { InMemoryEventStore } from './event-store.js';
import { EventTypes, type EventInput } from './events.js';
import { asUUID, asISOTimestamp, asSnapshotId, asCorrelationId } from '@genesis/contracts';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());
const ev = (type: string, n: number, snap = false): EventInput => {
  const b: EventInput = {
    event_id: asUUID(`e${n}`),
    event_type: type,
    event_time: iso(n * 1000),
    ingest_time: iso(n * 1000),
    source_engine: 't',
    schema_version: 1,
    correlation_id: asCorrelationId('c1'),
    payload: { action: 'buy', reason: 'x' },
  };
  return snap ? { ...b, snapshot_id: asSnapshotId('s1') } : b;
};

describe('append-only event store', () => {
  it('assigns seq + prev_hash chain and verifies (INV-E1)', () => {
    const s = new InMemoryEventStore();
    const a = s.append(ev(EventTypes.MarketTrade, 1));
    const b = s.append(ev(EventTypes.MarketTrade, 2));
    expect(a.seq).toBe(1);
    expect(b.prev_hash).toBe(a.hash);
    expect(s.verifyChain()).toBe(true);
  });
  it('detects tampering', () => {
    const s = new InMemoryEventStore();
    s.append(ev(EventTypes.MarketTrade, 1));
    (s.all()[0] as { payload: unknown }).payload = { action: 'sell', reason: 'bad' };
    expect(s.verifyChain()).toBe(false);
  });
  it('rejects decision-class event without snapshot_id (INV-E5)', () => {
    const s = new InMemoryEventStore();
    expect(() => s.append(ev(EventTypes.DecisionOutcome, 1, false))).toThrow(/E5/);
    expect(() => s.append(ev(EventTypes.DecisionOutcome, 1, true))).not.toThrow();
  });
  it('has no update/delete methods (structural append-only)', () => {
    const s = new InMemoryEventStore() as unknown as Record<string, unknown>;
    expect(s['update']).toBeUndefined();
    expect(s['delete']).toBeUndefined();
  });
});
