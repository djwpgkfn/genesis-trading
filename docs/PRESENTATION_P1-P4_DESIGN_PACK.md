# Presentation Layer — P1–P4 Integrated Design Pack (FIXED)

Baseline: main green (invariant 47/47, 151 tests). Design is frozen; implementation follows sequentially on the same branch without altering this design.

Layering (one-way): **Runtime → Presentation DTO → ViewModel → FrameView → Operator API → Browser**. Browser never references Runtime/Domain types. Presentation depends only on `contracts, invariant-runner, replay-engine`.

---

## P1 — Presentation Input DTO (foundation)

- `packages/presentation/src/input-dto.ts` — all fields **`readonly`**, arrays `readonly T[]`, pure data only (no methods, no engine types). Structurally compatible with the runtime snapshot (RecordedFrame) so callers pass runtime objects; presentation never names engine types.
- DTOs: `DecisionInput`, `DecisionTraceInput`, `SignalInput`, `StrategyInput`, `SnapshotInput`, `RiskInput`, `FeatureInput`, `MarketHealthInput`, `FrameInput` (extended with `readonly features?`, `readonly market_health?`).
- Invariant: **DTO Immutable** (deep-frozen DTO stays deep-equal; no data lost). Test: readonly compile + runtime freeze round-trip.

## P2 — FrameView expansion + serialization

- Views (pure mappers, plain DTO out): Decision, Signal, **Feature**, Explainability, **Replay Session**, Strategy, **Risk**, **Market Health**.
- `FrameView` gains `feature`, `risk`, `market_health`; `DashboardView` aggregates all.
- `packages/presentation/src/serialization.ts` — `serializeSession(view): string` / `deserializeSession(string): DashboardSessionView` (JSON; DTOs are plain). Generic `serialize/deserialize<T>` for any view.
- Invariant: **Serialize Round-Trip** (`deserialize(serialize(v)) deep-equals v`). Tests: each view mapper + round-trip.

## P3 — Presentation Snapshot (restore-only, ADR-012)

- `packages/presentation/src/snapshot.ts` — `PresentationSnapshot` = the serialized `DashboardSessionView` + cursor + meta. Flow: **Snapshot → Presentation State → ViewModel → FrameView**.
- **Restore only** (`restoreSnapshot(snapshot): PresentationState`); **no projection recompute** (ADR-012: reproject stored, verify — never recompute in presentation). Live and Replay both restore the same snapshot → identical view.
- Invariant: **Snapshot Deterministic** (restore(serialize(state)) == state) and **Replay == Live** (same frames ⇒ same snapshot ⇒ same view). Tests: snapshot restore, replay==live.

## P4 — Operator Console API (browser boundary)

- `packages/presentation/src/operator-api.ts` — `OperatorConsoleApi` interface the browser uses. **Returns DTOs only**, no Runtime access.
  - `getSession(): DashboardSessionView`
  - `getFrame(index): DashboardView`
  - `getHistory(): DecisionHistoryItem[]`
  - `subscribe(listener): () => void` (Observable; emits current session DTO)
- Implementations: `SnapshotOperatorApi` (from a PresentationSnapshot; used by Live and Replay identically) and `MockOperatorApi` (fixture DTO, for tests/Storybook). Framework-independent (no React/Electron/Web coupling).
- Invariants: **Presentation Boundary**, **No Runtime Leak** (API surface is DTO-only, JSON-serializable), **Browser Isolation** (api output has no functions/engine refs). Tests: mock API, DTO-only surface.

---

## Architecture Rules (enforced)

Presentation does not modify Domain; does not reference Runtime internals; uses DTOs only; browser dependencies stay inside `apps/dashboard`. Projection recompute is forbidden in presentation (ADR-012) — snapshot restore only.

## Invariants (target, added per phase, no new category — reuse E/A)

Presentation Boundary (A) · DTO Immutable (E) · No Runtime Leak (E) · Snapshot Deterministic (E) · Replay == Live (E) · Browser Isolation (E). Current 47 → grows as each phase lands real checks. No stub invariants.

## Test plan

Unit (each mapper), Replay==Live identity, DTO serialization round-trip, Snapshot restore, FrameView, Operator API mock. Existing tests must stay green.

## Completion

Build/ESLint/Prettier/Contract/Invariant/Vitest all green; baseline tests unbroken. Implementation order: **P1 → P2 → P3 → P4**, each a verified green increment.
