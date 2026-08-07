# ADR-I2A — Risk/Portfolio Provider Adapters (Runtime)

## Status
Accepted (I2-1). Additive; supersedes nothing. ADR-012 / ADR-S12A / Constitution unchanged.

## Context
LiveRuntime exposes injection slots `RiskProvider`/`PortfolioProvider` (default stubs). risk-engine
and portfolio-engine exist but were not wired into the live decision path.

## Decision
Add a **runtime-side adapter** (`packages/runtime/src/providers.ts`) that maps engine state to the
existing snapshot contracts — without modifying any engine or contract:
- `createRiskProvider(source)` → `RiskSnapshot{ budget_available, halted }` from `budgetSnapshot().available`
  and `state() ∈ {HALT, FROZEN}`.
- `createPortfolioProvider(source, positions)` → `PortfolioSnapshot{ exposure, max_exposure }` where
  `exposure = totalExposure(positions(asOf))` and `max_exposure = risk available` (portfolio stays within
  the Risk envelope).
- Risk source is a **structural interface** (`RiskSource`) — RiskEngine satisfies it; keeps runtime
  decoupled and unit-testable.

## Consequences
(+) Runtime can read real Risk/Portfolio snapshots; deterministic and Point-in-Time (reads state +
as-of positions only; no `Date.now`/rng). (+) Engines and contracts untouched; fully additive.
(−) Portfolio provider models current-state exposure within the risk envelope; PortfolioEngine.optimize
(sizing) remains a separate decision-time concern.

Invariants: none changed (48/48). Point-in-Time enforcement candidate INV-E11 deferred to I2-6 with a
real check.
