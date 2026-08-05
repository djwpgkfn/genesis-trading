import { describe, it, expect } from 'vitest';
import { PortfolioEngine } from './engine.js';
import { kellyFraction } from './optimizer.js';
import { rebalance } from './rebalance.js';
import { CorrelationMatrix } from './correlation.js';
import type { PortfolioInput } from './types.js';

const input = (available: number, total = 1000): PortfolioInput => ({
  snapshot_id: 'snap1',
  candidates: [
    { symbol: 'KRW-BTC', winProb: 0.6, payoffRatio: 2 },
    { symbol: 'KRW-ETH', winProb: 0.55, payoffRatio: 1.8 },
    { symbol: 'KRW-XRP', winProb: 0.52, payoffRatio: 1.5 },
  ],
  returns: {
    'KRW-BTC': [0.01, -0.02, 0.03, -0.01],
    'KRW-ETH': [0.011, -0.019, 0.028, -0.012],
    'KRW-XRP': [-0.02, 0.03, -0.01, 0.02],
  },
  budget: { total, available },
  constraints: { maxWeightPerSymbol: 0.2, maxCorrelationGroupExposure: 0.35, kellyFraction: 0.25, correlationThreshold: 0.8, maxTotalUtilization: 0.6 },
});

describe('Portfolio Engine (survival objective)', () => {
  it('kelly fraction is long-only', () => {
    expect(kellyFraction({ symbol: 'x', winProb: 0.6, payoffRatio: 2 })).toBeCloseTo(0.4, 6);
    expect(kellyFraction({ symbol: 'x', winProb: 0.3, payoffRatio: 1 })).toBe(0); // no edge → 0
  });

  it('never exceeds Risk available budget (INV-R5)', () => {
    const plan = new PortfolioEngine().optimize(input(100, 1000));
    expect(plan.total_notional).toBeLessThanOrEqual(100 + 1e-6);
    expect(plan.objective).toBe('long-term-survival');
  });

  it('respects total utilization cap when budget is ample', () => {
    const plan = new PortfolioEngine().optimize(input(1000, 1000));
    expect(plan.utilization).toBeLessThanOrEqual(0.6 + 1e-9);
    for (const a of plan.allocations) expect(a.weight).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('computes correlation exactly once per optimize (INV-A3)', () => {
    const before = CorrelationMatrix.buildCount;
    new PortfolioEngine().optimize(input(1000));
    expect(CorrelationMatrix.buildCount - before).toBe(1);
  });

  it('is deterministic (INV-D1) and event-sourced', () => {
    const eng = new PortfolioEngine();
    const a = eng.optimize(input(1000));
    const b = new PortfolioEngine().optimize(input(1000));
    expect(a.allocations).toEqual(b.allocations);
    expect(eng.eventLog().all().some((e) => e.event_type === 'Portfolio.planned')).toBe(true);
    expect(eng.eventLog().verifyChain()).toBe(true);
  });

  it('produces explainability per allocation', () => {
    const plan = new PortfolioEngine().optimize(input(1000));
    expect(plan.explain.length).toBe(3);
    expect(plan.explain[0]).toHaveProperty('kelly_raw');
    expect(plan.explain[0]).toHaveProperty('after_correlation');
    expect(plan.explain[0]).toHaveProperty('final_weight');
  });

  it('rebalance yields order intents within delta (no execution)', () => {
    const plan = new PortfolioEngine().optimize(input(1000));
    const orders = rebalance({ 'KRW-BTC': 0 }, plan.allocations);
    expect(orders.every((o) => o.notional > 0)).toBe(true);
  });
});
