import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryRawStore, type RawRecord } from '@genesis/data-layer';
import { TradingCore } from '@genesis/decision-engine';
import { InMemoryEventStore } from '@genesis/event-engine';
import { buildMarketSnapshot } from './snapshot.js';
import { LiveRuntime } from './live-runtime.js';

function seedStore(store: InMemoryRawStore, n = 40): void {
  for (let i = 0; i < n; i++) {
    const ms = i * 60_000;
    const rec: RawRecord = {
      kind: 'trade',
      symbol: 'KRW-BTC',
      event_time: new Date(ms).toISOString() as RawRecord['event_time'],
      ingest_time: new Date(ms).toISOString() as RawRecord['ingest_time'],
      event_time_ms: ms,
      ingest_time_ms: ms,
      seq: i,
      payload: { type: 'trade', code: 'KRW-BTC', trade_price: 100 + i * 1.5, trade_volume: 1 },
    };
    store.append(rec);
  }
}

describe('buildMarketSnapshot (pure)', () => {
  it('buckets trades into candles, past-only (no look-ahead)', () => {
    const store = new InMemoryRawStore();
    seedStore(store, 40);
    const snap = buildMarketSnapshot(store.all(), 'KRW-BTC', 20 * 60_000);
    expect(snap.symbol).toBe('KRW-BTC');
    expect(snap.candles.length).toBe(21); // buckets 0..20 inclusive
    expect(snap.candles.every((c) => c.time_ms <= 20 * 60_000)).toBe(true);
  });
  it('is deterministic (same records + asOf ⇒ same snapshot)', () => {
    const store = new InMemoryRawStore();
    seedStore(store, 40);
    const a = buildMarketSnapshot(store.all(), 'KRW-BTC', 40 * 60_000);
    const b = buildMarketSnapshot(store.all(), 'KRW-BTC', 40 * 60_000);
    expect(a).toEqual(b);
  });
});

describe('LiveRuntime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make() {
    const store = new InMemoryRawStore();
    seedStore(store, 40);
    const log = new InMemoryEventStore();
    const core = new TradingCore(log);
    const rt = new LiveRuntime(store, core, { symbol: 'KRW-BTC', now: () => 40 * 60_000 });
    return { store, log, core, rt };
  }

  it('tick() builds a snapshot, runs Trading Core, and appends events', () => {
    const { log, rt } = make();
    const result = rt.tick();
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.decision).not.toBeNull();
    const types = log.all().map((e) => e.event_type);
    expect(types).toContain('Signal.created');
    expect(types).toContain('Strategy.selected');
    expect(types).toContain('Decision.created');
  });

  it('is deterministic and replay-reproducible (same store + clock ⇒ identical decision)', () => {
    const a = make().rt.tick().decision;
    const b = make().rt.tick().decision;
    expect(a).toEqual(b);
  });

  it('start/stop drives ticks on the interval', () => {
    const { core, rt } = make();
    rt.start(1000);
    vi.advanceTimersByTime(3000);
    rt.stop();
    // at least one Decision.created recorded from the scheduled ticks
    expect(
      core
        .eventLog()
        .all()
        .some((e) => e.event_type === 'Decision.created'),
    ).toBe(true);
  });
});
