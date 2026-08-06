// Presentation Input DTOs — the ONLY input contract presentation consumes. Deeply readonly &
// immutable, pure data (no methods, no engine types). Runtime snapshots are structurally assignable.
export interface DecisionTraceInput {
  readonly action: string;
  readonly confidence: number;
  readonly steps: ReadonlyArray<{
    readonly stage: string;
    readonly detail: string;
    readonly refs: ReadonlyArray<string>;
  }>;
}
export interface DecisionInput {
  readonly id: string;
  readonly action: string;
  readonly confidence: number;
  readonly reason: string;
  readonly expected_risk: number;
  readonly expected_reward: number;
  readonly trace: DecisionTraceInput;
}
export interface SignalInput {
  readonly name: string;
  readonly value: number;
  readonly confidence: number;
  readonly strength: number;
  readonly source: ReadonlyArray<string>;
  readonly timestamp_ms: number;
}
export interface StrategyScoreInput {
  readonly name: string;
  readonly score: number;
  readonly confidence: number;
  readonly reason: ReadonlyArray<string>;
}
export interface StrategyInput {
  readonly active: string;
  readonly selected: ReadonlyArray<string>;
  readonly scores: ReadonlyArray<StrategyScoreInput>;
}
export interface SnapshotInput {
  readonly symbol: string;
  readonly timestamp_ms: number;
  readonly candles: ReadonlyArray<{ readonly close: number }>;
}
export interface RiskInput {
  readonly budget_available: number;
  readonly halted?: boolean;
}
/** A single runtime frame as consumed by presentation (matches RecordedFrame structurally). */
export interface FrameInput {
  readonly index: number;
  readonly timestamp_ms: number;
  readonly snapshot: SnapshotInput;
  readonly risk: RiskInput;
  readonly signals: ReadonlyArray<SignalInput>;
  readonly strategy: StrategyInput;
  readonly decision: DecisionInput;
}

/** Recursively freeze a presentation DTO so it is immutable at runtime (No Runtime Leak). */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}
