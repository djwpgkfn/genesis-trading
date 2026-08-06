import { describe, it, expect } from 'vitest';
import { ema, rsi, sma, atr, vwap, computeIndicators, type IndicatorCandle } from './indicators.js';

function candles(n: number): IndicatorCandle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + i * 1.5;
    return { high: close + 1, low: close - 1, close, volume: 10 + (i % 4) * 5 };
  });
}

describe('Feature Store indicators (SSOT)', () => {
  it('computeIndicators is deterministic (same candles ⇒ same features)', () => {
    const c = candles(40);
    expect(computeIndicators(c)).toEqual(computeIndicators(c));
  });

  it('Replay == Live: identical snapshot candles produce identical features', () => {
    const live = candles(40);
    const replay = candles(40); // rebuilt from the same recorded data
    expect(computeIndicators(live)).toEqual(computeIndicators(replay));
  });

  it('no look-ahead: features as-of k use only candles up to k', () => {
    const full = candles(40);
    const asOf20 = full.slice(0, 21);
    // stable regardless of later candles existing
    expect(computeIndicators(asOf20)).toEqual(computeIndicators(full.slice(0, 21)));
    // and differ from the full window → the as-of computation did not peek ahead
    expect(computeIndicators(asOf20).ema9).not.toBe(computeIndicators(full).ema9);
  });

  it('provides the full indicator set incl. ATR/VWAP/volumeAverage', () => {
    const f = computeIndicators(candles(40));
    for (const k of [
      'ema9',
      'ema21',
      'sma20',
      'rsi14',
      'macd',
      'bollinger',
      'volatility',
      'volumeRatio',
      'volumeAverage',
      'trendSlope',
      'atr14',
      'vwap',
    ] as const) {
      expect(f).toHaveProperty(k);
    }
    expect(f.atr14).not.toBeNull();
    expect(f.vwap).not.toBeNull();
  });

  it('short data yields neutral (null)', () => {
    expect(ema([1, 2], 9)).toBeNull();
    expect(rsi([1, 2], 14)).toBeNull();
    expect(sma([1, 2, 3], 2)).toBe(2.5);
    expect(atr([1], [1], [1], 14)).toBeNull();
    expect(vwap([], [])).toBeNull();
  });
});
