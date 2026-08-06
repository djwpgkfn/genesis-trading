import type { DecisionInput } from '../input-dto.js';

export interface ExplainabilityStepView {
  stage: string;
  detail: string;
  refs: string[];
}
export interface ExplainabilityViewModel {
  action: string;
  confidence_pct: string;
  chain: ExplainabilityStepView[]; // decision → strategy → signals → features → confidence
}

/** Pure mapper: Decision.trace → ordered explainability chain. No new judgment. */
export function explainabilityViewModel(d: DecisionInput): ExplainabilityViewModel {
  return {
    action: d.trace.action,
    confidence_pct: `${Math.round(d.trace.confidence * 100)}%`,
    chain: d.trace.steps.map((s) => ({ stage: s.stage, detail: s.detail, refs: [...s.refs] })),
  };
}
