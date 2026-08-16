# I1 Completion Report — Sealed Baseline

**Status:** ✅ COMPLETE — sealed as the stable baseline. Full CI gate PASS.
**Commit:** `49749f5`
**Frozen:** Architecture invariants, Contracts, Decision SSOT. Subsequent capability work (live integration) is additive and gated per-phase.

## CI verification (final — commit 49749f5)

| Gate               | Result                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Build (`tsc -b`)   | ✅                                                                                           |
| Lint (ESLint)      | ✅                                                                                           |
| Prettier `--check` | ✅                                                                                           |
| Contract validate  | ✅                                                                                           |
| Invariant validate | ✅ **48/48 invariants checked, 0 failing, 0 not-implemented** (64 checks across 13 packages) |
| Tests (Vitest)     | ✅ **38 files / 170 tests**                                                                  |

## Package inventory (workspace)

- **Contracts / core:** contracts, event-engine, invariant-runner
- **Data plane:** data-layer, adapters-upbit, adapters-db (ClickHouse write-behind), feature-store (indicator SSOT)
- **Decision plane (Trading Core):** signal-engine, strategy-engine, decision-engine (Decision SSOT)
- **Risk / portfolio / research:** risk-engine, portfolio-engine, research-platform
- **Production / ops / AI:** production-engine, ops, ai-layer
- **Runtime:** runtime — LiveRuntime loop (RawStore → `buildMarketSnapshot` → `TradingCore.run`) + read-only projection
- **Presentation:** presentation — immutable Input DTOs, ViewModels, FrameView (+ Feature/Risk/MarketHealth), serialize/deserialize codec, browser transport adapter
- **Console:** replay-engine (deterministic replay + console session), apps/dashboard (read-only React+Vite viewer)

## Invariant coverage (48)

Base D/T/R/V/S/E/A + **TC1–TC6** (Trading Core) + **R9/R10/R11** (deterministic replay, side-effect-free, transport orthogonality) + **E6–E10** (pure presentation mapping; no business logic; browser-boundary/serializable DTO; read-only; DTO immutable / no runtime leak).

## Presentation Browser Boundary (S12A) — COMPLETE

- Presentation depends only on `{contracts, invariant-runner, replay-engine}`; **no decision/signal/strategy/risk/feature-store/production/data-layer reference** in source or tests. See ADR-S12A.
- Event projection stays server-side (runtime); the browser consumes plain, **deeply-frozen, JSON-serializable DTOs** only (INV-E8/E10).
- Input DTOs are deeply `readonly`/immutable; ViewModels are pure (INV-E6/E7); mapping is read-only (INV-E9).
- FrameView extended (Decision/Signal/Feature/Explainability/ReplaySession/Strategy/Risk/MarketHealth) with a JSON serialize/deserialize codec.
- Browser transport adapter (snapshot push, incremental update, subscription, heartbeat, reconnect) is DTO-only and failure-isolated: a browser/transport fault never propagates into Runtime.

## Boundaries sealed

- Decision SSOT unchanged; contracts frozen.
- Read-only edge: no execution/order/paper/portfolio/risk/wallet in the console or browser path.
- Determinism preserved: single `systemNowMs` clock boundary; no `Date.now`/`Math.random` in engines; Replay == Live.
- ADR-012 (restore, no re-projection) upheld.

## Next (additive, out of this sealed scope)

Risk/Portfolio real wiring, Paper Execution, Upbit private auth, KIS adapter, AI advisory wiring, Production Runtime integration. Execution / live money remains out of scope until I4/I5. See `docs/S12_PLAN.md`.

## Checklist

- [x] Build [x] Lint [x] Prettier [x] Contract [x] Invariant 48/48 [x] Tests 170/38 files
- [x] Architecture invariants preserved [x] Contracts unchanged [x] Decision SSOT unchanged
- [x] S12A Presentation Browser Boundary complete [x] Baseline sealed at 49749f5
