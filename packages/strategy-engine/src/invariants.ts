import type { CheckResult } from '@genesis/invariant-runner';
import { StrategyEngine } from './engine.js';
import type { Signal } from '@genesis/signal-engine';

function sig(name: Signal['name'], value: number): Signal {
  return { id: `${name}@1`, name, value, strength: 0.8, confidence: 0.8, timestamp_ms: 1, source: ['f'] };
}

/** INV-TC2: strategy selection always yields at least one strategy (even with no signals). */
function checkTC2(): CheckResult {
  const e = new StrategyEngine();
  const withSignals = e.select([sig('TREND_UP', 1), sig('MACD_BULLISH', 1)]);
  const noSignals = e.select([]);
  const ok = withSignals.selected.length >= 1 && !!withSignals.active && noSignals.selected.length >= 1 && !!noSignals.active;
  return ok ? { id: 'INV-TC2', status: 'pass' } : { id: 'INV-TC2', status: 'fail', detail: 'no strategy selected' };
}

export const strategyChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [{ id: 'INV-TC2', fn: checkTC2 }];
