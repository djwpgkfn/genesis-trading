import type { CheckResult } from '@genesis/invariant-runner';
import { CorrelationMatrix } from './correlation.js';
import { PortfolioEngine } from './engine.js';
import type { PortfolioInput } from './types.js';

function input(available: number, total = 1000): PortfolioInput {
  return {
    snapshot_id: 'snap1',
    candidates: [
      { symbol: 'KRW-BTC', winProb: 0.6, payoffRatio: 2 },
      { symbol: 'KRW-ETH', winProb: 0.55, payoffRatio: 1.8 },
      { symbol: 'KRW-XRP', winProb: 0.52, payoffRatio: 1.5 },
    ],
    returns: {
      'KRW-BTC': [0.01, -0.02, 0.03, -0.01],
      'KRW-ETH': [0.011, -0.019, 0.028, -0.012], // correlated with BTC
      'KRW-XRP': [-0.02, 0.03, -0.01, 0.02], // anti-correlated
    },
    budget: { total, available },
    constraints: {
      maxWeightPerSymbol: 0.2,
      maxCorrelationGroupExposure: 0.35,
      kellyFraction: 0.25,
      correlationThreshold: 0.8,
      maxTotalUtilization: 0.6,
    },
  };
}

/** INV-R5: plan never exceeds Risk available budget. */
function checkR5(): CheckResult {
  const eng = new PortfolioEngine();
  const plan = eng.optimize(input(100, 1000)); // tiny available
  return plan.total_notional <= 100 + 1e-6
    ? { id: 'INV-R5', status: 'pass' }
    : { id: 'INV-R5', status: 'fail', detail: `${plan.total_notional}` };
}

/** INV-A3: correlation computed exactly once per optimize (single source). */
function checkA3(): CheckResult {
  const before = CorrelationMatrix.buildCount;
  new PortfolioEngine().optimize(input(1000));
  const built = CorrelationMatrix.buildCount - before;
  return built === 1
    ? { id: 'INV-A3', status: 'pass' }
    : { id: 'INV-A3', status: 'fail', detail: `built ${built} times` };
}

/** INV-D1: deterministic — same input → same plan. */
function checkD1(): CheckResult {
  const a = new PortfolioEngine().optimize(input(1000));
  const b = new PortfolioEngine().optimize(input(1000));
  return JSON.stringify(a.allocations) === JSON.stringify(b.allocations)
    ? { id: 'INV-D1', status: 'pass' }
    : { id: 'INV-D1', status: 'fail' };
}

export const portfolioChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-R5', fn: checkR5 },
  { id: 'INV-A3', fn: checkA3 },
  { id: 'INV-D1', fn: checkD1 },
];
