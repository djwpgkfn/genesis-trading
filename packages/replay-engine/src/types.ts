export type ReplayReason =
  'debug' | 'research' | 'education' | 'blog' | 'bug-repro' | 'audit' | string;
export type ReplayStatus = 'created' | 'running' | 'paused' | 'finished' | 'failed';

export interface EventRange {
  fromSeq: number;
  toSeq: number;
}

/** Serializable snapshot of a ReplaySession's state (for UI/AI/Explainability consumers). */
export interface ReplaySessionSnapshot {
  session_id: string;
  snapshot_id: string;
  event_range: EventRange;
  replay_speed: number;
  status: ReplayStatus;
  current_seq: number;
  current_event_id?: string;
  current_state_hash?: string;
  replay_reason: ReplayReason;
  started_at?: string;
  finished_at?: string;
}
