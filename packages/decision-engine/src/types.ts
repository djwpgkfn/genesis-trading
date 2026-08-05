export type DecisionAction = 'BUY' | 'SELL' | 'HOLD' | 'WAIT';

export interface RiskSnapshot {
  budget_available: number;
  halted: boolean;
}
export interface PortfolioSnapshot {
  exposure: number;
  max_exposure: number;
}

export interface DecisionTraceStep {
  stage: string;
  detail: string;
  refs: string[];
}
export interface DecisionTrace {
  action: DecisionAction;
  strategy: string;
  signals: string[];
  features: string[];
  confidence: number;
  steps: DecisionTraceStep[]; // Decision → Strategy → Signals → Features → Confidence
}

/**
 * Decision — the Trading Core's single output object (SSOT). Later stages (UI/Replay/Paper/Execution)
 * consume this exact interface. No orders are created here.
 */
export interface Decision {
  id: string;
  symbol: string;
  action: DecisionAction;
  confidence: number; // 0..1 (INV-TC5)
  reason: string;
  strategy_used: string; // INV-TC3
  signal_used: string[]; // INV-TC4
  expected_risk: number; // 0..1
  expected_reward: number; // 0..1
  timestamp_ms: number;
  trace: DecisionTrace; // always present (INV-TC6)
}
