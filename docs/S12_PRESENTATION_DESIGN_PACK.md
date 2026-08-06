# S12 Presentation Layer — Integrated Design Pack (P1–P4)

**Status:** FROZEN design. Implemented sequentially on the same branch; design is not changed mid-implementation.
**Baseline:** CI green — invariant **47/47**, **151 tests**. Every phase keeps this green (additive only).

Layering (one-way, enforced):

```
Runtime (engines, event store)
   │  produces RecordedFrame (runtime snapshot)
   ▼
Presentation Input DTO      ← P1  (readonly, immutable, pure data)
   ▼
ViewModel / FrameView       ← P2  (pure mappers, serialize/deserialize)
   ▼
Presentation Snapshot/State ← P3  (restore-only, Replay == Live, ADR-012)
   ▼
Operator Console API        ← P4  (DTO-returning, observable, mockable, browser-independent)
   ▼
Browser / Electron / Web
```

Rules (all phases): Presentation never modifies Domain, never imports Runtime internals, consumes DTO only; browser dependencies never leak out of the browser edge.

---

## P1 — Presentation Input DTO

- `packages/presentation/src/input-dto.ts` (exists from S12-fix) becomes **deeply `readonly`/immutable**: every property `readonly`, every array `ReadonlyArray`. Pure data — no methods, no engine types.
- Runtime types (`RecordedFrame`, `Decision`, …) are **structurally assignable** to the DTOs, so runtime passes objects directly while presentation names only DTOs.
- Runtime enforcement: `presentSession`/`buildSessionView` output is **deep-frozen** at the boundary.
- **Invariant:** INV-E11 _DTO Immutable / No Runtime Leak_ — presentation output is deeply frozen and JSON-serializable (no functions/class instances).
- **Test:** DTO serialization round-trip; frozen-mutation rejected.

## P2 — FrameView extension (serialize/deserialize)

- Extend the view set to: **Decision, Signal, Feature, Explainability, Replay Session, Strategy, Risk, Market Health**. Add `FeatureView`, `RiskView`, `MarketHealthView` DTOs (pure); reuse existing Decision/Signal/Strategy/Explainability views.
- `FrameView` aggregates all eight. A **codec** module provides `serialize(view): string` (JSON) and `deserialize(json): View` per view + for `FrameView`/`SessionView`.
- Feature view is sourced from the **already-computed** indicator set (Feature Store SSOT) carried on the frame — presentation does **not** recompute (Thin Core).
- **Invariant:** INV-E12 _Serialize Round-Trip_ — `deserialize(serialize(v))` deep-equals `v` for every view.
- **Test:** per-view serialize/deserialize; FrameView completeness (all 8 present).

## P3 — Presentation Snapshot (restore-only)

- `PresentationSnapshot` = a serialized `SessionView` + cursor + invariant status. Flow: **Snapshot → Presentation State → ViewModel → FrameView**.
- **ADR-012 compliance:** restore reads the stored snapshot; it **never re-runs projection/Trading Core** (no recompute). `restore(snapshot)` returns the same `FrameView`s that were serialized.
- Replay and Live build the snapshot via the **same** `presentSession` path → identical output.
- **Invariant:** INV-E13 _Snapshot Deterministic / Replay == Live_ — `restore(snapshot(frames))` deep-equals `presentSession(frames)`; no projection recompute occurs.
- **Test:** snapshot → restore round-trip; Replay-vs-Live identical FrameView from identical frames.

## P4 — Operator Console API

- `packages/presentation/src/operator-api.ts`: `OperatorConsoleApi` interface the browser calls. Methods return **DTOs only**: `getSession(): SessionView`, `getFrame(i): FrameView`, `getHistory(): DecisionHistoryItem[]`, `getInvariantStatus(): InvariantViewModel`, and an **observable** `subscribe(listener): unsubscribe`.
- Implementations: `SnapshotOperatorApi` (backed by a `PresentationSnapshot`) and `MockOperatorApi` (fixture DTO) — both browser-independent (no DOM/Runtime/engine imports).
- Browser accesses **only** this API; never Runtime. The API surface is pure DTO in/out, mockable, and framework-agnostic (works under Electron/Web).
- **Invariant:** INV-E14 _Browser Isolation / No Runtime Leak at API_ — the API returns only frozen, serializable DTOs (no Runtime/engine object escapes).
- **Test:** MockOperatorApi returns valid DTOs; observable notifies; API output is serializable/frozen.

---

## Invariants added (target 47 → 51)

| ID                                                                                                 | Name                                     | Phase |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----- |
| INV-E11                                                                                            | DTO Immutable / No Runtime Leak          | P1    |
| INV-E12                                                                                            | Serialize Round-Trip                     | P2    |
| INV-E13                                                                                            | Snapshot Deterministic / Replay == Live  | P3    |
| INV-E14                                                                                            | Browser Isolation (API returns DTO only) | P4    |
| (Existing E6–E10 retained. All under **E** category — no new category, per approved Amendment A1.) |

## Tests added

Unit (each view + DTO), Replay==Live identity, DTO serialization, Snapshot restore, FrameView completeness, Operator API mock/observable.

## Enforcement (retained + added)

- presentation deps ⊆ {contracts, invariant-runner, replay-engine} (dependency boundary test).
- No engine import in presentation src (already clean).
- API/DTO frozen + serializable (INV-E11/E14).

## Rollout order (frozen)

P1 → P2 → P3 → P4. Each: implement → user runs `npm run ci` → confirm green → next. No design change mid-way.
