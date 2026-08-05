# S12 Plan — Operator Console → Live Runtime

**Baseline (frozen):** S11 = 134 tests / 31 files, invariant **45/45**, build·lint·prettier·contract·CI all green. Every S12 task must keep this green; each task is a separate verified increment.

**Inherits:** Constitution, Decision SSOT, Thin Core, Deterministic Runtime, Event Sourcing. Read-only edge preserved until execution is explicitly introduced (I4/I5, out of S12 scope).

---

## Task breakdown (priority order)

### T1 — Dashboard (UI) restore _(this increment)_

- Scope: recreate `apps/dashboard` (React+Vite+TS+Tailwind, dark, read-only) consuming `@genesis/presentation` VMs + `@genesis/replay-engine` only. 8 panels incl. DecisionHistory (→ `seekToDecision`). No BUY/SELL/order/execution.
- Root isolation: `apps/*` in workspaces; excluded from root tsconfig refs, vitest include, eslint, prettier → **root green untouched**. Dashboard builds via its own `vite build`.
- Invariants: none added (UI-boundary invariant INV-UI1 deferred to when it can be a real dependency-boundary check, T-late).
- Risk: low (isolated). ADR/RFC: none.

### T2 — Replay Console (interactive)

- Scope: wire the dashboard ReplayPanel to a live `OperatorReplaySession` with full transport (play loop by speed, pause/stop/step/seek/seekToDecision). Add a small UI-local ticking loop (no engine change).
- Packages: `apps/dashboard` only. replay-engine unchanged.
- Risk: low. ADR/RFC: none.

### T3 — Live Runtime connect

- Scope: introduce a **Runtime service** that drives `TradingCore` over a live `MarketSnapshot` source and appends the 3 events; expose a read-only projection the dashboard can view (Live data-source, mirroring the existing S10 Live/Replay seam). Still **no execution**.
- Packages: new `packages/runtime` (or extend `src/`), depends on decision/signal/strategy-engine + event-engine. Deterministic clock injected.
- Invariants: reuse E (deterministic projection), A (DAG). Possibly INV-A4 (dashboard has no execution path) becomes a real check here.
- Risk: medium. **ADR-013** (Live Runtime: snapshot cadence, backpressure, read-only projection). RFC-S12 §Live.

### T4 — Upbit realtime data connect

- Scope: feed the Runtime from the existing `src/collector.ts` (Upbit WS ticker/trade → RawStore → candle build → MarketSnapshot). No orders.
- Packages: adapters-upbit (existing), data-layer (existing), runtime. Env-gated; offline fallback to fixtures.
- Risk: medium (network, IP allowlist). ADR/RFC: RFC-S12 §DataSource. Note existing Upbit key IP-allowlist requirement.

### T5 — KIS Adapter connect _(new broker)_

- Scope: add `packages/adapters-kis` (Korea Investment & Securities) implementing the same S1 `RestClient`/`WsTransport`/`ExchangeAdapter` contracts as Upbit — **market data + read-only account** first; order path stays behind the Risk/Execution gate (not in S12).
- Packages: new `packages/adapters-kis` (contracts unchanged — must fit existing interfaces).
- Invariants: adapter conformance (reuse existing adapter contract tests pattern).
- Risk: medium-high (new external API, auth). **ADR-014** (multi-broker abstraction: Upbit + KIS behind one adapter contract; symbol/venue model). RFC-S12 §Brokers.

### T6 — AI Layer connect

- Scope: wire existing `packages/ai-layer` (S9: 4 sub-AIs, Proposal Lifecycle, advisory-only, structurally blocked from execution) into the Runtime as **advisory**; surface proposals read-only in the dashboard. LLM cannot execute (structural block preserved).
- Packages: ai-layer (existing), runtime, presentation (AI proposal VM), dashboard.
- Invariants: reuse S/D isolation invariants; add presentation VM (E-purity).
- Risk: medium. **ADR-015** (AI advisory wiring: no execution authority). RFC-S12 §AI.

### T7 — Production Runtime integration

- Scope: integrate `packages/production-engine` (S8: Cycle Orchestrator, Control Plane, Snapshot Runtime, Execution Gateway **still not called for real orders**) with Runtime + AI + Risk/Portfolio for a full **paper-ready** cycle. Execution remains gated (real orders = I5, out of scope).
- Packages: production-engine (existing), runtime, risk/portfolio (existing).
- Invariants: reuse S8 production invariants; verify orchestrator single-call, snapshot atomicity.
- Risk: high (integration surface). **ADR-016** (Production Runtime integration boundary; execution gate stays closed in S12). RFC-S12 §Production.

---

## ADR / RFC impact summary

- **New ADRs:** ADR-013 Live Runtime, ADR-014 Multi-broker (Upbit+KIS), ADR-015 AI advisory wiring, ADR-016 Production Runtime integration.
- **New RFC:** RFC-S12 (Operator Console → Live Runtime), sections Live/DataSource/Brokers/AI/Production. Non-goals: **real order execution, live money** (I5).
- **Unchanged/frozen:** Constitution, Decision SSOT, contracts (KIS must fit existing S1 interfaces), ADR-012, RFC-I3.

## Sequencing & green-gates

T1 → T2 → T3 → T4 → T5 → T6 → T7. Each task: implement → user runs `build/test/ci` (+ dashboard `vite build`) → confirm green → next. No task modifies the S11 baseline packages destructively; additive only. Execution/live-money path is **not** opened in S12.
