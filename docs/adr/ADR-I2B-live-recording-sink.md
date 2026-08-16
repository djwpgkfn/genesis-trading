# ADR-I2B — Live Recording Sink (Runtime)

## Status

Accepted (I2-2). Additive. ADR-012 / ADR-S12A / Constitution / event contracts unchanged.

## Context

Replay, fault analysis, and decision verification need the runtime's operating state over time.
LiveRuntime produced decisions/events but did not retain per-tick frames for replay/presentation.

## Decision

Add a **bounded recording sink** to LiveRuntime (additive; `tick()` signature/return unchanged):

- `RingBuffer<T>` (`packages/runtime/src/ring-buffer.ts`) — deterministic FIFO, drops oldest past capacity.
- On each decision-producing tick, record a `RecordedFrame` (existing replay schema) built from the
  same snapshot/risk/portfolio/signals/strategy/decision the tick already computed. **No new domain
  event; existing event contract untouched.**
- `frames()` exposes the buffered frames; `recordingCapacity` option bounds memory (default 512).

## Consequences

(+) Live frames reuse the Replay schema → `presentSession(frames)` renders identically for Live and
Replay (Replay == Live, same pipeline). (+) Deterministic and Point-in-Time (frame built only from the
tick's as-of inputs). (+) Bounded memory. (−) Frames beyond capacity are dropped (recent-window view);
long-horizon history remains the event log's responsibility.

Invariants: none changed (48/48). Recording-determinism (INV-E13) verified by test now; registry
invariant deferred to I2-6 with a real check.
