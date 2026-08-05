import type { Decision } from '@genesis/decision-engine';

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const ACTION_COLOR: Record<string, string> = { BUY: 'green', SELL: 'red', HOLD: 'amber', WAIT: 'grey' };

export interface DecisionViewModel {
  action: string;
  action_color: string;
  confidence_pct: string;
  expected_risk_pct: string;
  expected_reward_pct: string;
  rr_ratio: string;
  position_size_display: string;
  reason: string;
}

/** Pure mapper: Decision (SSOT) → display shape. No business logic, no recomputation. */
export function decisionViewModel(d: Decision): DecisionViewModel {
  const rr = d.expected_risk === 0 ? '—' : (d.expected_reward / d.expected_risk).toFixed(2);
  return {
    action: d.action,
    action_color: ACTION_COLOR[d.action] ?? 'grey',
    confidence_pct: pct(d.confidence),
    expected_risk_pct: pct(d.expected_risk),
    expected_reward_pct: pct(d.expected_reward),
    rr_ratio: rr,
    position_size_display: '— (requires Risk/Portfolio, I4)',
    reason: d.reason,
  };
}
