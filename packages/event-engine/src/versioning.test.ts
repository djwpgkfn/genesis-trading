import { describe, it, expect } from 'vitest';
import { InMemoryEventStore } from './event-store.js';
import { UpcasterRegistry } from './versioning.js';
import { EventTypes, type EventInput } from './events.js';
import { asUUID, asISOTimestamp, asCorrelationId } from '@genesis/contracts';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());

describe('event versioning (read-time upcasting, originals immutable)', () => {
  it('migrates v1 payload to v2 at read time without mutating the stored event', () => {
    const s = new InMemoryEventStore();
    const input: EventInput = {
      event_id: asUUID('e1'), event_type: EventTypes.MarketTicker, event_time: iso(1000), ingest_time: iso(1000),
      source_engine: 't', schema_version: 1, correlation_id: asCorrelationId('c1'), payload: { price: 100 },
    };
    const stored = s.append(input);
    const up = new UpcasterRegistry();
    up.register(EventTypes.MarketTicker, 1, 2, (p) => ({ ...(p as object), trade_price: (p as { price: number }).price }));
    const upcasted = up.upcast<{ price: number; trade_price: number }>(stored);
    expect(upcasted.schema_version).toBe(2);
    expect(upcasted.payload.trade_price).toBe(100);
    // original untouched
    expect(stored.schema_version).toBe(1);
    expect((stored.payload as { trade_price?: number }).trade_price).toBeUndefined();
  });
});
