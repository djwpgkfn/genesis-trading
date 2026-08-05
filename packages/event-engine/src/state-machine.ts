import { EventTypes, type EventInput, type StoredEvent } from './events.js';
import type { EventStore } from './event-store.js';
import type { UUID, ISOTimestamp, CorrelationId } from '@genesis/contracts';

/**
 * State is derived ONLY from State.transitioned events (INV-S2). There is no way to change
 * state without appending an event — the store is the single source of truth.
 */
export interface Transition {
  machine: string;
  from: string;
  to: string;
}

export function emitTransition(
  store: EventStore,
  t: Transition,
  meta: { event_id: UUID; at: ISOTimestamp; correlation_id: CorrelationId; source_engine: string },
): StoredEvent {
  const input: EventInput<Transition> = {
    event_id: meta.event_id,
    event_type: EventTypes.StateTransitioned,
    event_time: meta.at,
    ingest_time: meta.at,
    source_engine: meta.source_engine,
    schema_version: 1,
    correlation_id: meta.correlation_id,
    payload: t,
  };
  return store.append(input);
}

/** Derive current state of a machine purely from the event log. */
export function currentState(store: EventStore, machine: string): string | null {
  let state: string | null = null;
  for (const e of store.all()) {
    if (
      e.event_type === EventTypes.StateTransitioned &&
      (e.payload as Transition).machine === machine
    ) {
      state = (e.payload as Transition).to;
    }
  }
  return state;
}
