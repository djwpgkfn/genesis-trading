import type { EventStore, StoredEvent } from '@genesis/event-engine';
import type { ReplaySession } from '@genesis/replay-engine';

/** Read-only event source. Views depend ONLY on this — identical for Live and Replay. */
export interface UIDataSource {
  events(): readonly StoredEvent[];
}

export class LiveDataSource implements UIDataSource {
  constructor(private readonly store: EventStore) {}
  events(): readonly StoredEvent[] {
    return this.store.all();
  }
}

/** Replay source reuses the S4 ReplaySession — same UI, data source only swapped. */
export class ReplayDataSource implements UIDataSource {
  constructor(private readonly session: ReplaySession) {}
  events(): readonly StoredEvent[] {
    return this.session.appliedEvents;
  }
}
