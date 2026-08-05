import { describe, it, expect } from 'vitest';
import { SignalEngine, type MarketSnapshot } from './index.js';
import { ema, rsi, sma, volatility, trendSlope } from './features.js';

function uptrend(n = 40): MarketSnapshot {
  const candles = Array.from({ length: n }, (_, i) => {
    const close = 100 + i * 1.5;
    return { open: close - 1, high: close + 1, low: close - 1, close, volume: 10 + (i % 4) * 5, time_ms: i * 60000 };
  });
  return { symbol: 'KRW-BTC', timestamp_ms: n * 60000, candles };
}
function downtrend(n = 40): MarketSnapshot {
  const s = uptrend(n);
  return { ...s, candles: s.candles.map((c, i) => ({ ...c, close: 160 - i * 1.5 })) };
}

describe('SignalEngine', () => {
  it('produces signals with confidence/strength in [0,1] and basis features (INV-TC1)', () => {
    const signals = new SignalEngine().generate(uptrend());
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      expect(s.strength).toBeGreaterThanOrEqual(0);
      expect(s.strength).toBeLessThanOrEqual(1);
      expect(s.source.length).toBeGreaterThan(0);
    }
  });
  it('detects an uptrend and a downtrend', () => {
    expect(new SignalEngine().generate(uptrend()).some((s) => s.name === 'TREND_UP')).toBe(true);
    expect(new SignalEngine().generate(downtrend()).some((s) => s.name === 'TREND_DOWN')).toBe(true);
  });
  it('is deterministic', () => {
    expect(new SignalEngine().generate(uptrend())).toEqual(new SignalEngine().generate(uptrend()));
  });
  it('returns no signals for empty candles', () => {
    expect(new SignalEngine().generate({ symbol: 'X', timestamp_ms: 0, candles: [] })).toEqual([]);
  });
  it('emits orderbook imbalance', () => {
    const snap = { ...uptrend(), orderbook: { bids: [{ price: 99, size: 80 }], asks: [{ price: 101, size: 20 }] } };
    expect(new SignalEngine().generate(snap).some((s) => s.name === 'ORDERBOOK_IMBALANCE')).toBe(true);
  });
  it('feature math handles short data (neutral)', () => {
    expect(ema([1, 2], 9)).toBeNull();
    expect(rsi([1, 2], 14)).toBeNull();
    expect(sma([1, 2, 3], 2)).toBe(2.5);
    expect(volatility([1], 20)).toBeNull();
    expect(trendSlope([1, 2], 20)).toBeNull();
  });
});
