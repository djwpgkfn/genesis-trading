import { describe, it, expect } from 'vitest';
import { StrategyEngine } from './index.js';
import type { Signal, SignalName } from '@genesis/signal-engine';

const sig = (name: SignalName, value: number, strength = 0.8, confidence = 0.8): Signal => ({
  id: `${name}@1`,
  name,
  value,
  strength,
  confidence,
  timestamp_ms: 1,
  source: ['f'],
});

describe('StrategyEngine', () => {
  it('selects the highest-scoring strategy as active', () => {
    const d = new StrategyEngine().select([
      sig('TREND_UP', 1),
      sig('EMA_CROSS', 1),
      sig('MACD_BULLISH', 1),
    ]);
    expect(d.active).toBeTruthy();
    expect(d.selected.length).toBeGreaterThanOrEqual(1);
    expect(d.scores[0]!.name).toBe(d.active);
  });
  it('always selects at least one strategy even with no signals (INV-TC2)', () => {
    const d = new StrategyEngine().select([]);
    expect(d.selected.length).toBeGreaterThanOrEqual(1);
    expect(d.active).toBeTruthy();
  });
  it('scores are sorted descending and confidence in [0,1]', () => {
    const d = new StrategyEngine().select([sig('VOLATILITY_HIGH', 1), sig('BB_BREAKOUT', 1)]);
    for (let i = 1; i < d.scores.length; i++)
      expect(d.scores[i - 1]!.score).toBeGreaterThanOrEqual(d.scores[i]!.score);
    for (const s of d.scores) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });
  it('reason lists contributing signals', () => {
    const d = new StrategyEngine().select([sig('BB_BREAKOUT', 1), sig('HIGH_VOLUME', 1)]);
    expect(d.scores.find((s) => s.name === 'breakout')!.reason).toContain('BB_BREAKOUT');
  });
});
