/** Strategy-derived candidate (edge inputs for survival sizing). */
export interface Candidate {
  symbol: string;
  winProb: number; // 0..1
  payoffRatio: number; // avg win / avg loss (>0)
}

/** Risk envelope injected by the orchestrator (Portfolio NEVER calls Risk directly — F1/INV-A2). */
export interface RiskBudgetView {
  total: number;
  available: number;
}

export interface PortfolioConstraints {
  maxWeightPerSymbol: number; // ruin-avoidance per position
  maxCorrelationGroupExposure: number;
  kellyFraction: number; // fractional Kelly (<1, survival-first)
  correlationThreshold: number; // group clustering
  maxTotalUtilization: number; // 0..1 of total budget
}

export interface ExplainEntry {
  symbol: string;
  kelly_raw: number;
  after_correlation: number;
  after_constraints: number;
  final_weight: number;
  notional: number;
  reason: string;
}

export interface Allocation {
  symbol: string;
  weight: number;
  notional: number;
}

export interface PortfolioPlan {
  snapshot_id: string;
  objective: 'long-term-survival';
  allocations: Allocation[];
  total_notional: number;
  utilization: number; // total_notional / budget.total
  explain: ExplainEntry[];
}

export interface PortfolioInput {
  snapshot_id: string;
  candidates: Candidate[];
  returns: Record<string, number[]>; // per-symbol return series (for correlation)
  budget: RiskBudgetView; // injected Risk envelope
  constraints: PortfolioConstraints;
}
