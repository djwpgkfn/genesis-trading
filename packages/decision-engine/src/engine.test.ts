import { describe, it, expect } from 'vitest';
import { DecisionEngine } from './index.js';
import type { StrategyDecision, StrategyName } from '@genesis/strategy-engine';
import type { Signal, SignalName } from '@genesis/signal-engine';

const sig = (name: SignalName, value: number): Signal => ({
  id: `${name}@1`,
  name,
  value,
  strength: 0.9,
  confidence: 0.9,
  timestamp_ms: 1,
  source: ['f'],
});
const strat = (name: StrategyName = 'momentum'): StrategyDecision => ({
  active: name,
  selected: [name],
  scores: [{ name, score: 1.5, confidence: 0.8, reason: ['x'] }],
});
const risk = { budget_available: 1000, halted: false };
const pf = { exposure: 0, max_exposure: 1000 };
const ctx = { symbol: 'KRW-BTC', timestamp_ms: 1 };

describe('DecisionEngine', () => {
  it('BUY on bullish conviction', () => {
    expect(
      new DecisionEngine().decide(
        strat(),
        [sig('TREND_UP', 1), sig('MACD_BULLISH', 1)],
        risk,
        pf,
        ctx,
      ).action,
    ).toBe('BUY');
  });
  it('SELL on bearish conviction', () => {
    expect(
      new DecisionEngine().decide(
        strat(),
        [sig('TREND_DOWN', -1), sig('MACD_BEARISH', -1)],
        risk,
        pf,
        ctx,
      ).action,
    ).toBe('SELL');
  });
  it('WAIT when risk halted', () => {
    expect(
      new DecisionEngine().decide(
        strat(),
        [sig('TREND_UP', 1)],
        { budget_available: 1000, halted: true },
        pf,
        ctx,
      ).action,
    ).toBe('WAIT');
  });
  it('HOLD at max exposure on bullish', () => {
    expect(
      new DecisionEngine().decide(
        strat(),
        [sig('TREND_UP', 1), sig('MACD_BULLISH', 1)],
        risk,
        { exposure: 1000, max_exposure: 1000 },
        ctx,
      ).action,
    ).toBe('HOLD');
  });
  it('WAIT bullish with no budget', () => {
    expect(
      new DecisionEngine().decide(
        strat(),
        [sig('TREND_UP', 1), sig('MACD_BULLISH', 1)],
        { budget_available: 0, halted: false },
        pf,
        ctx,
      ).action,
    ).toBe('WAIT');
  });
  it('HOLD when no clear conviction', () => {
    expect(new DecisionEngine().decide(strat(), [sig('LOW_VOLUME', 0)], risk, pf, ctx).action).toBe(
      'HOLD',
    );
  });
  it('throws without a strategy (INV-TC3)', () => {
    expect(() =>
      new DecisionEngine().decide(
        { active: undefined as unknown as StrategyName, selected: [], scores: [] },
        [sig('TREND_UP', 1)],
        risk,
        pf,
        ctx,
      ),
    ).toThrow();
  });
  it('throws without signals (INV-TC4)', () => {
    expect(() => new DecisionEngine().decide(strat(), [], risk, pf, ctx)).toThrow();
  });
  it('confidence and expected risk/reward in [0,1] (INV-TC5)', () => {
    const d = new DecisionEngine().decide(strat(), [sig('TREND_UP', 1)], risk, pf, ctx);
    for (const v of [d.confidence, d.expected_risk, d.expected_reward]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('carries a full explainability trace (INV-TC6)', () => {
    const d = new DecisionEngine().decide(strat(), [sig('TREND_UP', 1)], risk, pf, ctx);
    expect(d.trace.steps.map((s) => s.stage)).toEqual([
      'decision',
      'strategy',
      'signals',
      'features',
      'confidence',
    ]);
    expect(d.strategy_used).toBe('momentum');
    expect(d.signal_used.length).toBeGreaterThan(0);
  });
});
