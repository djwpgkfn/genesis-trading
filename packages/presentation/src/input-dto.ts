// Presentation Input DTOs — the ONLY input contract the presentation layer consumes.
// Structurally compatible with the runtime snapshot (RecordedFrame) and engine outputs, so callers
// pass runtime objects directly, but presentation never references engine packages.
export interface DecisionTraceInput {
  action: string;
  confidence: number;
  steps: { stage: string; detail: string; refs: string[] }[];
}
export interface DecisionInput {
  id: string;
  action: string;
  confidence: number;
  reason: string;
  expected_risk: number;
  expected_reward: number;
  trace: DecisionTraceInput;
}
export interface SignalInput {
  name: string;
  value: number;
  confidence: number;
  strength: number;
  source: string[];
  timestamp_ms: number;
}
export interface StrategyScoreInput {
  name: string;
  score: number;
  confidence: number;
  reason: string[];
}
export interface StrategyInput {
  active: string;
  selected: string[];
  scores: StrategyScoreInput[];
}
export interface SnapshotInput {
  symbol: string;
  timestamp_ms: number;
  candles: { close: number }[];
}
export interface RiskInput {
  budget_available: number;
  halted?: boolean;
}

/** A single runtime frame as consumed by presentation (matches RecordedFrame structurally). */
export interface FrameInput {
  index: number;
  timestamp_ms: number;
  snapshot: SnapshotInput;
  risk: RiskInput;
  signals: SignalInput[];
  strategy: StrategyInput;
  decision: DecisionInput;
}
