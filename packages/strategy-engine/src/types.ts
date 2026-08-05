export type StrategyName =
  | 'trend-following'
  | 'mean-reversion'
  | 'breakout'
  | 'scalping'
  | 'swing'
  | 'range'
  | 'momentum'
  | 'volatility';

export interface StrategyScore {
  name: StrategyName;
  score: number;
  confidence: number; // 0..1
  reason: string[]; // contributing signal names
}
export interface StrategyDecision {
  active: StrategyName; // highest-scoring
  selected: StrategyName[]; // at least one (INV-TC2)
  scores: StrategyScore[];
}
