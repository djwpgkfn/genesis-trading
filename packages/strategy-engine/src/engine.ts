import type { Signal, SignalName } from '@genesis/signal-engine';
import type { StrategyName, StrategyScore, StrategyDecision } from './types.js';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

const WEIGHTS: Record<StrategyName, Partial<Record<SignalName, number>>> = {
  'trend-following': { TREND_UP: 1, TREND_DOWN: 1, EMA_CROSS: 1, MACD_BULLISH: 0.8, MACD_BEARISH: 0.8, HIGH_VOLUME: 0.4 },
  'mean-reversion': { RSI_OVERSOLD: 1, RSI_OVERBOUGHT: 1, BB_BREAKOUT: 0.6, LOW_VOLUME: 0.3 },
  breakout: { BB_BREAKOUT: 1, HIGH_VOLUME: 0.8, VOLATILITY_HIGH: 0.6 },
  scalping: { HIGH_VOLUME: 1, LIQUIDITY_HIGH: 0.8, ORDERBOOK_IMBALANCE: 0.6 },
  swing: { TREND_UP: 0.8, TREND_DOWN: 0.8, EMA_CROSS: 0.8, MACD_BULLISH: 0.5, MACD_BEARISH: 0.5 },
  range: { RSI_OVERSOLD: 0.6, RSI_OVERBOUGHT: 0.6, LOW_VOLUME: 0.5, LIQUIDITY_HIGH: 0.3 },
  momentum: { MACD_BULLISH: 1, MACD_BEARISH: 1, TREND_UP: 0.8, TREND_DOWN: 0.8, HIGH_VOLUME: 0.6 },
  volatility: { VOLATILITY_HIGH: 1, BB_BREAKOUT: 0.6, HIGH_VOLUME: 0.4 },
};

const ALL: StrategyName[] = Object.keys(WEIGHTS) as StrategyName[];

/** Strategy Engine: Signal Set → scored strategies; highest is Active (>= 1 selected). */
export class StrategyEngine {
  select(signals: readonly Signal[]): StrategyDecision {
    const scores: StrategyScore[] = ALL.map((name) => {
      const w = WEIGHTS[name];
      let score = 0;
      const reason: string[] = [];
      for (const s of signals) {
        const weight = w[s.name] ?? 0;
        if (weight > 0) {
          score += weight * s.strength * s.confidence;
          reason.push(s.name);
        }
      }
      return { name, score, confidence: clamp01(score / 3), reason };
    }).sort((a, b) => b.score - a.score);

    const active = scores[0]!.name; // always defined (ALL is non-empty) → INV-TC2
    const selected = scores.filter((s) => s.score > 0).map((s) => s.name);
    if (selected.length === 0) selected.push(active); // guarantee >= 1
    return { active, selected, scores };
  }
}
