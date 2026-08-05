import type { AIProposal } from './types.js';

export interface CalibrationPoint {
  confidence: number;
  realized: number;
} // 0..1
export interface AIMemoryState {
  proposalHistory: { proposal_id: string; kind: string; status: string }[];
  success: number;
  failure: number;
  calibration: CalibrationPoint[];
}

/**
 * AI Memory records the AI's OWN track record (meta), separate from the market Memory Layer.
 * Reproducible & versioned — derived from logged AI events + realized outcomes.
 */
export class AIMemory {
  private state: AIMemoryState = { proposalHistory: [], success: 0, failure: 0, calibration: [] };

  recordProposal(p: AIProposal): void {
    this.state.proposalHistory.push({ proposal_id: p.proposal_id, kind: p.kind, status: p.status });
  }
  recordOutcome(success: boolean, confidence: number, realized: number): void {
    if (success) this.state.success++;
    else this.state.failure++;
    this.state.calibration.push({ confidence, realized });
  }
  successRate(): number {
    const total = this.state.success + this.state.failure;
    return total === 0 ? 0 : this.state.success / total;
  }
  /** Mean |confidence − realized| — lower is better-calibrated. */
  calibrationError(): number {
    if (this.state.calibration.length === 0) return 0;
    return (
      this.state.calibration.reduce((a, c) => a + Math.abs(c.confidence - c.realized), 0) /
      this.state.calibration.length
    );
  }
  /** Simple drift signal: change in calibration error between halves. */
  drift(): number {
    const c = this.state.calibration;
    if (c.length < 2) return 0;
    const mid = Math.floor(c.length / 2);
    const err = (arr: CalibrationPoint[]) =>
      arr.reduce((a, x) => a + Math.abs(x.confidence - x.realized), 0) / (arr.length || 1);
    return err(c.slice(mid)) - err(c.slice(0, mid));
  }
  snapshot(): AIMemoryState {
    return JSON.parse(JSON.stringify(this.state)) as AIMemoryState;
  }
}
