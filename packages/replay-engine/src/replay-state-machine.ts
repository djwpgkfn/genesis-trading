export type ReplayState = 'IDLE' | 'LOADED' | 'PLAYING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';

/** Operator replay transport transitions (I3). Navigation self-loops live in LOADED/PAUSED. */
export const REPLAY_TRANSITIONS: Record<ReplayState, readonly ReplayState[]> = {
  IDLE: ['LOADED'],
  LOADED: ['PLAYING', 'LOADED'],
  PLAYING: ['PAUSED', 'COMPLETED', 'STOPPED'],
  PAUSED: ['PLAYING', 'STOPPED', 'PAUSED'],
  STOPPED: ['LOADED'],
  COMPLETED: ['LOADED'],
};

export function canReplayTransition(from: ReplayState, to: ReplayState): boolean {
  return REPLAY_TRANSITIONS[from].includes(to);
}
