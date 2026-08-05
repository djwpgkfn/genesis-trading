# ADR-S12A — Presentation is browser-safe; event projection stays server-side

## Context
The dashboard (Vite/browser) imported `@genesis/presentation`, whose projection modules
(control/data-source/explainability/views) transitively import `@genesis/event-engine` →
`node:crypto`, which cannot resolve in a browser bundle.

## Decision
- Presentation exposes **browser-safe view contracts** (`FrameView`, `SessionView`, `MarketView`)
  and **pure ViewModels**; these have only type-only engine imports (erased at build).
- Event projection / recording assembly happens in the **runtime/application layer** (server-side),
  which produces a plain `SessionView` DTO.
- The **dashboard consumes DTOs/ViewModels only** — every `@genesis` import in the dashboard is
  `import type`, so no engine runtime (and no `node:crypto`) enters the browser bundle.
- No Vite polyfill/alias workaround; `event-engine` hashing is unchanged.

## Consequences
(+) Dashboard `vite build` passes; root `ci` unchanged (45/45). (+) Clean layer boundary; runtime
supplies real `SessionView` in T3/T4. (−) A DTO contract must be kept in sync (covered by ViewModel tests).
Alternatives rejected: browser polyfill for node:crypto (bypass), removing event-engine hashing.
