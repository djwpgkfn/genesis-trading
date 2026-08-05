export type ExperimentMode = 'backtest' | 'wfv' | 'paper' | 'shadow';
export type ExperimentStatus = 'created' | 'running' | 'completed' | 'failed';

export interface Period {
  start: number;
  end: number;
} // event_time ms
export interface Provenance {
  created_by: string;
  method_version: string;
  created_at: string;
}

export interface FoldResult {
  start: number;
  end: number;
  passed: boolean;
  metrics: Record<string, number>;
}

export interface ExperimentResult {
  metrics: Record<string, number>;
  passed: boolean;
  decisions: number;
  state_hash?: string;
  folds?: FoldResult[];
}

/** Experiment is the TOP-LEVEL execution object (above Strategy). */
export interface Experiment {
  experiment_id: string;
  hypothesis_id: string;
  snapshot_id: string;
  strategy_version: string;
  feature_set_version: string;
  dataset: string;
  period: Period;
  mode: ExperimentMode;
  status: ExperimentStatus;
  result?: ExperimentResult;
  provenance: Provenance;
}

export interface Hypothesis {
  hypothesis_id: string;
  statement: string;
  success_criteria: Record<string, number>; // metric → min threshold, fixed BEFORE running
  status: 'proposed' | 'testing' | 'verified' | 'rejected';
}

export interface Proposal {
  proposal_id: string;
  kind: string;
  payload: unknown;
  status: 'draft' | 'candidate' | 'validated' | 'approved' | 'rejected' | 'archived';
}
