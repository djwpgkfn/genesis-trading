import { describe, it, expect } from 'vitest';
import { TradingCore } from './index.js';
import { InMemoryEventStore } from '@genesis/event-engine';
import type { MarketSnapshot } from '@genesis/signal-engine';

function uptrend(): MarketSnapshot {
  const candles = Array.from({ length: 40 }, (_, i) => {
    const close = 100 + i * 1.5;
    return { open: close - 1, high: close + 1, low: close - 1, close, volume: 10 + (i % 4) * 5, time_ms: i * 60000 };
  });
  return { symbol: 'KRW-BTC', timestamp_ms: 40 * 60000, candles };
}
const risk = { budget_available: 1000, halted: false };
const pf = { exposure: 0, max_exposure: 1000 };

describe('TradingCore pipeline', () => {
  it('runs Market→Signal→Strategy→Decision and emits three event types', () => {
    const log = new InMemoryEventStore();
    const r = new TradingCore(log).run(uptrend(), risk, pf);
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.strategy.selected.length).toBeGreaterThanOrEqual(1);
    expect(r.decision).not.toBeNull();
    const types = log.all().map((e) => e.event_type);
    expect(types).toContain('Signal.created');
    expect(types).toContain('Strategy.selected');
    expect(types).toContain('Decision.created');
    expect(log.verifyChain()).toBe(true);
  });
  it('is deterministic (same snapshot → same decision)', () => {
    expect(new TradingCore().run(uptrend(), risk, pf).decision).toEqual(new TradingCore().run(uptrend(), risk, pf).decision);
  });
  it('creates no decision when there are no signals (INV-TC4)', () => {
    const tc = new TradingCore();
    const r = tc.run({ symbol: 'X', timestamp_ms: 0, candles: [] }, risk, pf);
    expect(r.decision).toBeNull();
    expect(tc.eventLog().all().map((e) => e.event_type)).not.toContain('Decision.created');
  });
});
