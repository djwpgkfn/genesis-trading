import type { OperatorReplaySession, ReplaySpeed } from '@genesis/replay-engine';

/** Minimal, browser-safe frame view contract (no engine/event-engine dependency). */
export interface DecisionFrame {
  index: number;
  timestamp_ms: number;
  decision: { id: string; action: string; confidence: number };
}

export interface DecisionHistoryItem {
  decision_id: string;
  frame_index: number;
  timestamp_ms: number;
  action: string;
  confidence_pct: string;
}
export interface ReplayViewModel {
  state: string;
  frame_index: number;
  total_frames: number;
  decision_id: string;
  speed: ReplaySpeed;
  history: DecisionHistoryItem[];
}

/** Pure mapper: recorded frames → Decision History list (display only). */
export function decisionHistory(frames: readonly DecisionFrame[]): DecisionHistoryItem[] {
  return frames.map((f) => ({
    decision_id: f.decision.id,
    frame_index: f.index,
    timestamp_ms: f.timestamp_ms,
    action: f.decision.action,
    confidence_pct: `${Math.round(f.decision.confidence * 100)}%`,
  }));
}

/** Pure mapper: session transport state + history → display shape. No replay control here. */
export function replayViewModel(session: OperatorReplaySession): ReplayViewModel {
  const cur = session.getCursor();
  const frames = session.timeline();
  return {
    state: session.getState(),
    frame_index: cur.frame_index,
    total_frames: frames.length,
    decision_id: cur.decision_id,
    speed: session.getSpeed(),
    history: decisionHistory(frames),
  };
}
