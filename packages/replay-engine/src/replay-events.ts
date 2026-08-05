// Replay is itself Event-Sourced. These events are internal (Contracts unchanged).
export const ReplayEventTypes = {
  Started: 'Replay.started',
  Paused: 'Replay.paused',
  Resumed: 'Replay.resumed',
  Seeked: 'Replay.seeked',
  Finished: 'Replay.finished',
  Failed: 'Replay.failed',
} as const;

export interface ReplayStartedPayload {
  session_id: string;
  snapshot_id: string;
  fromSeq: number;
  toSeq: number;
  replay_speed: number;
  replay_reason: string;
}
export interface ReplaySeekedPayload {
  session_id: string;
  from_seq: number;
  to_seq: number;
}
export interface ReplaySimplePayload {
  session_id: string;
  at_seq: number;
}
export interface ReplayFinishedPayload {
  session_id: string;
  final_state_hash: string;
  applied: number;
}
export interface ReplayFailedPayload {
  session_id: string;
  at_seq: number;
  error: string;
}
