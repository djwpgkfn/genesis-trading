# ADR-I2C — Snapshot + Incremental Patch UI Model

## Status

Accepted (I2-3). Additive. ADR-012 / ADR-S12A / ADR-I2A / ADR-I2B / Constitution / contracts unchanged.

## Context

A realtime trading UI must stay live without re-fetching a full snapshot each change, yet remain
deterministic and share the exact pipeline with Replay. Polling / fixtures / mock streams are forbidden.

## Decision

- **Two channels:** _Full Snapshot_ (`presentSession(frames)` via `pushSnapshot`) for initial connect /
  recovery / replay-start; _Incremental Patch_ (`pushUpdate`) for live change.
- **Patch codec (presentation, pure DTO):** `PresentationPatch = {op:'append-frame',frame,history} |
{op:'reset',session}`; `applyPatch(snapshot,patch)` is a pure, immutable reducer. No domain types.
- **RealtimePublisher (runtime, push-driven):** builds the snapshot and per-new-frame append-patches
  from `LiveRuntime.frames()` and pushes them to a structural `PushSink` (BrowserAdapter satisfies it).
  No timers, no polling, no fixtures. Runtime never references Browser directly.
- **Consistency (INV-E11):** `initialSnapshot ⊕ Σ(append-patch) == presentSession(allFrames)` — the patch
  stream reconstructs the full snapshot, and Live/Replay share the same `presentSession`/`dashboardView`.

## Consequences

(+) Live UI updates incrementally with a guaranteed-consistent full snapshot; Replay == Live pipeline.
(+) Presentation stays DTO-only/Domain-free; Browser is a Read-Only observer; failures isolated via the
sink. (−) Market-only high-frequency deltas (price/orderbook without a decision) are a follow-up patch
op (I2-4), layered on the same model.

Invariant added: **INV-E11** (real check). 48 -> 49.
