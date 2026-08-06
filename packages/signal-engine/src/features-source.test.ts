import { describe, it, expect } from 'vitest';
import * as sig from './features.js';
import * as store from '@genesis/feature-store';

// Proves the Feature Store is the single source of computation: the Signal Engine re-exports the
// exact same function objects (no local reimplementation of feature math).
describe('Signal Engine uses Feature Store as SSOT', () => {
  it('re-exports the same indicator functions (identity)', () => {
    expect(sig.ema).toBe(store.ema);
    expect(sig.sma).toBe(store.sma);
    expect(sig.rsi).toBe(store.rsi);
    expect(sig.macd).toBe(store.macd);
    expect(sig.bollinger).toBe(store.bollinger);
    expect(sig.volatility).toBe(store.volatility);
    expect(sig.volumeRatio).toBe(store.volumeRatio);
    expect(sig.trendSlope).toBe(store.trendSlope);
    expect(sig.computeIndicators).toBe(store.computeIndicators);
  });
});
