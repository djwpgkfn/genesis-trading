# RFC-I3 — Operator Console (Replay + Presentation + Dashboard)

- Status: Approved (with Amendments A1–A3)
- Scope: Read-only AI Decision Viewer. No Execution, Order, Paper Trading,
  Portfolio, Risk Budget, Wallet, Auto-Trading.

## Summary

A read-only Operator Console lets a human verify AI decisions 100% by navigating a
deterministic replay of recorded decision cycles, rendered through pure ViewModels
in a dark, trading-terminal-style dashboard with no trading controls.

## Motivation

Trust and auditability: before Paper/Live trading (I4/I5), operators must inspect
why each Decision was made, frame-by-frame, and confirm determinism.

## Design

Decision SSOT -> Replay Engine -> Presentation Layer -> Dashboard (read-only).
See `docs/I3_ARCHITECTURE.md` for architecture, state machine, sequence, event/state
flow and the component tree.

## Approved Amendments

- A1 — No new invariant category. Replay invariants fold into R (INV-R9/R10/R11).
  Presentation-purity uses E; the read-only-console boundary uses A. No RP/PR/UI
  categories are created.
- A2 — CI includes a Vite production build: `build -> lint -> test -> vite build`
  must all be green. Introduced when `apps/dashboard` lands (rollout step 3/4).
- A3 — Decision History Panel: a time-ordered list of recorded Decisions; clicking
  an entry calls `seekToDecision(id)` and moves the console to that frame's
  Signal -> Strategy -> Decision -> Explainability state. Backed by
  `OperatorReplaySession.timeline()` + `seekToDecision()`.

## Non-goals (explicit)

Execution, Upbit orders, Paper Trading, Portfolio, Risk Budget, Wallet,
Auto-Trading, Live streaming source. No write path to the exchange. Position Size
is indicative-only.

## Backwards compatibility

Purely additive. Decision SSOT unchanged; existing invariants untouched; existing
S4/S10 files unchanged (new files only).

## Rollout

1. Replay Engine (session/state-machine/restore) — DONE.
2. Presentation ViewModels — pending.
3. apps/dashboard (panels incl. Decision History) — pending.
4. Invariants (PR/UI) + CI vite build — pending. Target 46/46.

Each step is kept build / lint / test (and, from step 3, vite build) green.
