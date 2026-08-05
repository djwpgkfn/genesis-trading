import type { StoredEvent } from './events.js';
import type { UpcasterRegistry } from './versioning.js';

/** A projection is a pure fold over events → derived state. Always deletable & rebuildable. */
export interface Projection<S> {
  name: string;
  version: string;
  initial(): S;
  apply(state: S, event: StoredEvent): S; // pure
}

/**
 * Runs the SAME pipeline for Live and Replay — only the event source differs.
 * `externalSink` is present only for Live; in Replay it is omitted, guaranteeing
 * replay is side-effect-free (INV-E3).
 */
export function runPipeline<S>(
  source: Iterable<StoredEvent>,
  projection: Projection<S>,
  opts: { upcaster?: UpcasterRegistry; externalSink?: (e: StoredEvent) => void } = {},
): S {
  let state = projection.initial();
  for (const raw of source) {
    const e = opts.upcaster ? opts.upcaster.upcast(raw) : raw;
    state = projection.apply(state, e);
    opts.externalSink?.(e); // never provided during Replay
  }
  return state;
}

export class ProjectionEngine {
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly upcaster?: UpcasterRegistry) {}

  /** Build (or rebuild) a projection from an event source. Deterministic. */
  build<S>(source: Iterable<StoredEvent>, projection: Projection<S>): S {
    const state = this.upcaster
      ? runPipeline(source, projection, { upcaster: this.upcaster })
      : runPipeline(source, projection);
    this.cache.set(projection.name, state);
    return state;
  }

  /** Delete a projection's materialized state (projections are disposable). */
  delete(name: string): void {
    this.cache.delete(name);
  }

  get<S>(name: string): S | undefined {
    return this.cache.get(name) as S | undefined;
  }

  /** delete + rebuild → must equal the original (INV-E4). */
  rebuild<S>(source: Iterable<StoredEvent>, projection: Projection<S>): S {
    this.delete(projection.name);
    return this.build(source, projection);
  }
}
