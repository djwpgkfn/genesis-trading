import type { CheckResult } from '@genesis/invariant-runner';
import { DecisionEngine } from './engine.js';
import type { DecisionContext } from './engine.js';
import type { Signal } from '@genesis/signal-engine';
import type { StrategyDecision, StrategyName } from '@genesis/strategy-engine';

const sig = (name: Signal['name'], value: number): Signal => ({
  id: `${name}@1`,
  name,
  value,
  strength: 0.8,
  confidence: 0.8,
  timestamp_ms: 1,
  source: ['f'],
});
const goodStrategy: StrategyDecision = {
  active: 'momentum',
  selected: ['momentum'],
  scores: [{ name: 'momentum', score: 1.5, confidence: 0.8, reason: ['TREND_UP'] }],
};
const risk = { budget_available: 1000, halted: false };
const pf = { exposure: 0, max_exposure: 1000 };
const ctx: DecisionContext = { symbol: 'KRW-BTC', timestamp_ms: 1 };

/** INV-TC3: a Decision cannot be created without a selected strategy. */
function checkTC3(): CheckResult {
  const e = new DecisionEngine();
  const empty: StrategyDecision = {
    active: undefined as unknown as StrategyName,
    selected: [],
    scores: [],
  };
  let threw = false;
  try {
    e.decide(empty, [sig('TREND_UP', 1)], risk, pf, ctx);
  } catch {
    threw = true;
  }
  return threw
    ? { id: 'INV-TC3', status: 'pass' }
    : { id: 'INV-TC3', status: 'fail', detail: 'decision made without strategy' };
}

/** INV-TC4: a Decision cannot be created without at least one signal. */
function checkTC4(): CheckResult {
  const e = new DecisionEngine();
  let threw = false;
  try {
    e.decide(goodStrategy, [], risk, pf, ctx);
  } catch {
    threw = true;
  }
  return threw
    ? { id: 'INV-TC4', status: 'pass' }
    : { id: 'INV-TC4', status: 'fail', detail: 'decision made without signals' };
}

/** INV-TC5: Decision confidence is within [0,1]. */
function checkTC5(): CheckResult {
  const d = new DecisionEngine().decide(
    goodStrategy,
    [sig('TREND_UP', 1), sig('MACD_BULLISH', 1)],
    risk,
    pf,
    ctx,
  );
  const ok = d.confidence >= 0 && d.confidence <= 1;
  return ok
    ? { id: 'INV-TC5', status: 'pass' }
    : { id: 'INV-TC5', status: 'fail', detail: `confidence=${d.confidence}` };
}

/** INV-TC6: a Decision always carries an explainability trace. */
function checkTC6(): CheckResult {
  const d = new DecisionEngine().decide(goodStrategy, [sig('TREND_UP', 1)], risk, pf, ctx);
  const ok = !!d.trace && d.trace.steps.length > 0 && d.trace.steps[0]!.stage === 'decision';
  return ok
    ? { id: 'INV-TC6', status: 'pass' }
    : { id: 'INV-TC6', status: 'fail', detail: 'missing trace' };
}

export const decisionChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-TC3', fn: checkTC3 },
  { id: 'INV-TC4', fn: checkTC4 },
  { id: 'INV-TC5', fn: checkTC5 },
  { id: 'INV-TC6', fn: checkTC6 },
];
