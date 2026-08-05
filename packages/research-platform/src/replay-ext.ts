import type { ReplaySession } from '@genesis/replay-engine';

/** Mark a point in a replay for later study (extensible for future Research tooling). */
export interface ReplayBookmark {
  bookmark_id: string;
  session_id: string;
  seq: number;
  label: string;
}

let bmCounter = 0;
export function createBookmark(session: ReplaySession, label: string): ReplayBookmark {
  return {
    bookmark_id: `bm-${++bmCounter}`,
    session_id: session.session_id,
    seq: session.currentSeq,
    label,
  };
}

export interface ReplayDiff {
  state_hash_equal: boolean;
  a_state_hash?: string;
  b_state_hash?: string;
}

/** Compare two replay sessions' reconstructed states (extensible; e.g. per-decision diffs later). */
export function diffSessions(a: ReplaySession, b: ReplaySession): ReplayDiff {
  const ah = a.stateHash;
  const bh = b.stateHash;
  return {
    state_hash_equal: ah === bh,
    ...(ah ? { a_state_hash: ah } : {}),
    ...(bh ? { b_state_hash: bh } : {}),
  };
}
