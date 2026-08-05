# ADR-012 — Replay via Reproject + on-demand Verify (not Recompute-only)

- Status: Accepted (I3)
- Date: I3
- Supersedes: —

## Context

The Operator Console must (a) show past AI decisions exactly and (b) prove that
replay reproduces the same decision that was produced live (Constitution:
Deterministic Runtime, Replay == Live). Two strategies exist:

- Reproject: read back the stored `Decision.created` events (fast, exact, but
  trusts storage).
- Recompute: re-run the Trading Core from stored `MarketSnapshot`s under a frozen
  clock (proves determinism, heavier).

## Decision

Default to Reproject for viewing (the stored `Decision` is the SSOT), and provide
Recompute-and-compare as an on-demand Verify that asserts deep equality with the
stored decision. Verify backs INV-R9 (Deterministic Replay) and runs in CI over
full recordings.

## Consequences

- Fast, exact viewer; determinism provable on demand and in CI golden tests.
- The viewer does not couple to engine internals for normal use.
- Two code paths (reproject / recompute) to keep in sync — mitigated by shared
  `RecordedFrame` types and Verify tests running over whole timelines.

## Alternatives rejected

- Recompute-only: slow and redundant for pure viewing.
- Reproject-only: no machine proof of determinism.
