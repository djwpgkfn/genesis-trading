# Genesis Trading System

Implementation baseline. Governed by **Architecture Constitution v1.0 (FROZEN)**.

Baseline docs (single source of truth): Constitution · System Contracts · Invariant Registry · Design Pack · Implementation Playbook.

This repository is the **S0 Repository Foundation**. See `S0_COMPLETION_REPORT.md`.

## Layout

- `docs/` — project rules & pointers to baseline docs (design docs live in the Design Pack, not here)
- `contracts/` — shared contract **types** (Event, Snapshot, Manifest, DecisionRecord) — types only in S0
- `packages/` — engine packages (invariant-runner in S0; data/feature/risk/... added S1+)
- `tools/` — dev tooling (contract-validate)
- `src/` — application composition root (placeholder until S8)
- `tests/` — cross-package tests
- `scripts/`, `configs/`, `.github/workflows/` — automation & config

## Commands

`npm run ci` runs: build · lint · format:check · contract:validate · invariant:validate · test.

> Network is disabled in the authoring environment; run `npm install` in your own Windows environment first.

## I3 — Operator Console (Replay + Presentation + Dashboard)

Read-only AI Decision Viewer. No Execution, Order, Paper Trading, Portfolio, Risk
Budget, Wallet, or Auto-Trading. See `docs/I3_ARCHITECTURE.md`,
`docs/adr/ADR-012-replay-reproject-vs-recompute.md`, and
`docs/rfc/RFC-I3-operator-console.md`.

- **Replay Engine** (`@genesis/replay-engine`, done) — `OperatorReplaySession` over a
  recorded timeline: cursor, speed (1x/2x/5x/10x), state machine
  (IDLE→LOADED→PLAYING→PAUSED→STOPPED→COMPLETED), snapshot/decision restore, and
  `seekToDecision` for the Decision History Panel. Deterministic: frozen replay
  clock, no `Date.now()`/`Math.random()`, no network. `recompute` verifies
  Replay == Live (INV-R9). Invariants: **INV-R9/R10/R11** (R category).
- **Presentation** (planned, rollout step 2) — six pure ViewModels
  (Decision/Signal/Strategy/Explainability/Invariant/Replay), no business logic;
  `ReplayViewModel.history[]` powers the Decision History Panel.
- **Dashboard** (`apps/dashboard`, planned, rollout step 3) — React + Vite + TS +
  Tailwind, dark theme. Panels: Market, Signal, Strategy, Decision, Explainability,
  Invariant, Replay (+ Decision History). **Read-only — no BUY/SELL/order buttons.**
  CI will add a Vite production build (build → lint → test → vite build).
