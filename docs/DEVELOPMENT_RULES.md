# Development Rules (Genesis Trading)

Derived from Architecture Constitution v1.0. These are enforced by CI where possible.

1. **결정론 유지 (Determinism)** — same input + Snapshot => same output. No `Math.random`/`Date.now`
   in engine logic; use pinned `rng_seed` and injected clocks. (P2, INV-D1)
2. **Event First** — every state change is an event before it is anything else. (Event Sourcing, INV-E1)
3. **Contract First** — depend on `@genesis/contracts` interfaces, never on another engine's internals. (INV-A1)
4. **Test First** — each stage's Definition of Done includes tests + relevant Invariant checks.
5. **Replay 가능 (Replayable)** — nothing that can't be reconstructed from Event Log + Snapshot. (INV-D2, E3)
6. **Snapshot 기반 (Snapshot-based)** — runtime reads the active Snapshot; changes ship as new Snapshots. (INV-V2/V5)
7. **Constitution 위반 금지** — conflicts are never patched directly; raise an **RFC candidate**. (Governance)

### Pre-change 5-point gate (Playbook G1)

Before any new feature: (1) Constitution violation? (2) Contracts impact? (3) Invariant impact?
(4) Snapshot reproducibility impact? (5) Event Sourcing impact? → conflict ⇒ RFC only.
