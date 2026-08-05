import type { StoredEvent } from './events.js';

export type Upcaster = (payload: unknown) => unknown;
interface Step { from: number; to: number; fn: Upcaster }

/**
 * Event Versioning strategy: each event_type has a schema_version. Stored events are IMMUTABLE
 * (INV-E1). Migration happens at READ time by chaining upcasters from the stored schema_version
 * up to the current version. Old events are never rewritten.
 */
export class UpcasterRegistry {
  private readonly steps = new Map<string, Step[]>();
  private readonly current = new Map<string, number>();

  /** Register a migration event_type: from → from+... and advance the "current" version. */
  register(eventType: string, from: number, to: number, fn: Upcaster): void {
    const arr = this.steps.get(eventType) ?? [];
    arr.push({ from, to, fn });
    arr.sort((a, b) => a.from - b.from);
    this.steps.set(eventType, arr);
    this.current.set(eventType, Math.max(this.current.get(eventType) ?? to, to));
  }

  currentVersion(eventType: string, fallback: number): number {
    return this.current.get(eventType) ?? fallback;
  }

  /** Return the event with its payload migrated to the current schema_version. Original untouched. */
  upcast<T = unknown>(e: StoredEvent): StoredEvent<T> {
    const target = this.currentVersion(e.event_type, e.schema_version);
    if (e.schema_version >= target) return e as StoredEvent<T>;
    let payload = e.payload;
    let v = e.schema_version;
    for (const s of this.steps.get(e.event_type) ?? []) {
      if (s.from === v) {
        payload = s.fn(payload);
        v = s.to;
      }
    }
    return { ...e, schema_version: v, payload } as StoredEvent<T>;
  }
}
