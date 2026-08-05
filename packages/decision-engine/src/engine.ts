import type { Signal } from '@genesis/signal-engine';
import type { StrategyDecision } from '@genesis/strategy-engine';
import type { Decision, DecisionAction, DecisionTrace, PortfolioSnapshot, RiskSnapshot } from './types.js';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface DecisionContext {
  symbol: string;
  timestamp_ms: number;
  threshold?: number;
}

/** Decision Engine: Strategy + Signals + Risk + Portfolio → Decision (no orders, no execution). */
export class DecisionEngine {
  decide(
    strategy: StrategyDecision,
    signals: readonly Signal[],
    risk: RiskSnapshot,
    portfolio: PortfolioSnapshot,
    ctx: DecisionContext,
  ): Decision {
    // Guards (invariants enforced at construction).
    if (!strategy || !strategy.active || strategy.selected.length === 0) {
      throw new Error('Decision requires a selected strategy (INV-TC3)');
    }
    if (signals.length === 0) {
      throw new Error('Decision requires at least one signal (INV-TC4)');
    }
    const threshold = ctx.threshold ?? 0.15;

    // Directional conviction from signals.
    const net = signals.reduce((a, s) => a + s.value * s.strength * s.confidence, 0);
    const magnitude = Math.min(1, Math.abs(net));
    const activeScore = strategy.scores.find((s) => s.name === strategy.active);
    const stratConf = activeScore?.confidence ?? 0;

    let action: DecisionAction;
    let reason: string;
    if (risk.halted) {
      action = 'WAIT';
      reason = 'risk halted — no new decisions';
    } else if (net > threshold && risk.budget_available <= 0) {
      action = 'WAIT';
      reason = 'bullish but no risk budget available';
    } else if (net > threshold && portfolio.exposure >= portfolio.max_exposure) {
      action = 'HOLD';
      reason = 'bullish but at max exposure';
    } else if (net > threshold) {
      action = 'BUY';
      reason = `bullish conviction ${net.toFixed(2)} via ${strategy.active}`;
    } else if (net < -threshold) {
      action = 'SELL';
      reason = `bearish conviction ${net.toFixed(2)} via ${strategy.active}`;
    } else {
      action = 'HOLD';
      reason = `no clear conviction (net ${net.toFixed(2)})`;
    }

    const confidence = clamp01(stratConf * (0.5 + magnitude / 2));
    const volStrength = signals.find((s) => s.name === 'VOLATILITY_HIGH')?.strength ?? 0;
    const expected_risk = clamp01(0.5 * (portfolio.exposure / (portfolio.max_exposure || 1)) + 0.5 * volStrength);
    const expected_reward = clamp01(magnitude * stratConf);

    const signalUsed = signals
      .filter((s) => (action === 'BUY' ? s.value > 0 : action === 'SELL' ? s.value < 0 : true))
      .map((s) => s.name);
    const features = [...new Set(signals.flatMap((s) => s.source))];

    const trace: DecisionTrace = {
      action,
      strategy: strategy.active,
      signals: signals.map((s) => s.name),
      features,
      confidence,
      steps: [
        { stage: 'decision', detail: action, refs: [reason] },
        { stage: 'strategy', detail: `${strategy.active} (score ${activeScore?.score.toFixed(2) ?? '0'})`, refs: activeScore?.reason ?? [] },
        { stage: 'signals', detail: `${signals.length} signals`, refs: signals.map((s) => s.id) },
        { stage: 'features', detail: `${features.length} basis features`, refs: features },
        { stage: 'confidence', detail: `${(confidence * 100).toFixed(0)}%`, refs: [`stratConf=${stratConf.toFixed(2)}`, `net=${net.toFixed(2)}`] },
      ],
    };

    return {
      id: `decision-${ctx.timestamp_ms}`,
      symbol: ctx.symbol,
      action,
      confidence,
      reason,
      strategy_used: strategy.active,
      signal_used: signalUsed.length > 0 ? signalUsed : signals.map((s) => s.name),
      expected_risk,
      expected_reward,
      timestamp_ms: ctx.timestamp_ms,
      trace,
    };
  }
}
