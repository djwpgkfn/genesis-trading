import type { Experiment } from './types.js';

export type PromotionOutcome = 'promoted-in-research' | 'rejected';

export interface PromotionDecision {
  champion_experiment_id: string | null;
  challenger_experiment_id: string;
  outcome: PromotionOutcome;
  reason: string;
}

/**
 * Research-internal Champion/Challenger. A challenger may become the RESEARCH champion only —
 * this NEVER connects to Production (Production promotion is a later stage via signed Manifest).
 */
export class ResearchChampionChallenger {
  private champion: Experiment | null = null;

  getChampion(): Experiment | null {
    return this.champion;
  }

  /** Challenger must pass WFV and beat champion on primary metric (out-of-sample). */
  evaluate(challenger: Experiment, primaryMetric = 'activity'): PromotionDecision {
    const r = challenger.result;
    if (!r || !r.passed || !r.folds || r.folds.length === 0) {
      return {
        champion_experiment_id: this.champion?.experiment_id ?? null,
        challenger_experiment_id: challenger.experiment_id,
        outcome: 'rejected',
        reason: 'not WFV-validated',
      };
    }
    const chMetric = r.metrics[primaryMetric] ?? challenger.result!.decisions;
    const champMetric =
      this.champion?.result?.metrics[primaryMetric] ??
      this.champion?.result?.decisions ??
      -Infinity;
    if (this.champion === null || chMetric > champMetric) {
      const prev = this.champion?.experiment_id ?? null;
      this.champion = challenger; // Research-internal champion only
      return {
        champion_experiment_id: prev,
        challenger_experiment_id: challenger.experiment_id,
        outcome: 'promoted-in-research',
        reason: 'beat research champion (WFV-validated)',
      };
    }
    return {
      champion_experiment_id: this.champion.experiment_id,
      challenger_experiment_id: challenger.experiment_id,
      outcome: 'rejected',
      reason: 'did not beat champion',
    };
  }
}
