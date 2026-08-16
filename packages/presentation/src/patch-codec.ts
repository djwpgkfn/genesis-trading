import type { DashboardView, DashboardSessionView } from './frame-view.js';
import type { DecisionHistoryItem } from './viewmodels/replay-vm.js';
import { deepFreeze } from './input-dto.js';

/**
 * Incremental presentation patch. Pure DTO — no domain/runtime types. Applied on top of a Full
 * Snapshot to reach the next state, so a Browser can stay live without re-fetching a full snapshot.
 */
export type PresentationPatch =
  | { op: 'append-frame'; frame: DashboardView; history: DecisionHistoryItem }
  | { op: 'reset'; session: DashboardSessionView };

/** Pure reducer: (snapshot, patch) -> next snapshot. Immutable output (deep-frozen). */
export function applyPatch(
  snapshot: DashboardSessionView,
  patch: PresentationPatch,
): DashboardSessionView {
  if (patch.op === 'reset')
    return deepFreeze({ frames: [...patch.session.frames], history: [...patch.session.history] });
  return deepFreeze({
    frames: [...snapshot.frames, patch.frame],
    history: [...snapshot.history, patch.history],
  });
}

/** Fold a patch stream onto a snapshot (consumer/test helper). */
export function applyPatches(
  snapshot: DashboardSessionView,
  patches: readonly PresentationPatch[],
): DashboardSessionView {
  return patches.reduce(applyPatch, snapshot);
}
