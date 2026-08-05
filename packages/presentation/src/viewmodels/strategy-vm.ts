import type { StrategyDecision } from '@genesis/strategy-engine';

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export interface StrategyScoreView {
  name: string;
  score: string;
  confidence_pct: string;
  reason: string[];
}
export interface StrategyViewModel {
  active: string;
  selected: string[];
  scores: StrategyScoreView[];
}

/** Pure mapper: StrategyDecision → display shape. No re-scoring. */
export function strategyViewModel(s: StrategyDecision): StrategyViewModel {
  return {
    active: s.active,
    selected: [...s.selected],
    scores: s.scores.map((x) => ({
      name: x.name,
      score: x.score.toFixed(2),
      confidence_pct: pct(x.confidence),
      reason: [...x.reason],
    })),
  };
}
