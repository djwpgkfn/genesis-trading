import type { UUID, ISOTimestamp, SnapshotId, CorrelationId, EventType } from '@genesis/contracts';

/** Event as submitted for sealing (no seq/prev_hash/hash — the store assigns those). */
export interface EventInput<T = unknown> {
  event_id: UUID;
  event_type: EventType;
  event_time: ISOTimestamp;
  ingest_time: ISOTimestamp;
  source_engine: string;
  schema_version: number;
  snapshot_id?: SnapshotId;
  correlation_id: CorrelationId;
  causation_id?: UUID;
  payload: T;
}

/** Sealed, stored event (append-only). */
export interface StoredEvent<T = unknown> extends EventInput<T> {
  seq: number;
  prev_hash?: string;
  hash: string;
}

// Internal event-type taxonomy (S1 MarketData promotion + decision/state classes).
// Kept internal per scope; promotion to @genesis/contracts is a governance (RFC) step.
export const EventTypes = {
  MarketTrade: 'MarketData.trade',
  MarketOrderbook: 'MarketData.orderbook',
  MarketTicker: 'MarketData.ticker',
  DecisionStage: 'Decision.stage',
  DecisionOutcome: 'Decision.outcome',
  StateTransitioned: 'State.transitioned',
} as const;

/** Decision-class events must carry correlation_id + snapshot_id (INV-E5). */
export const DECISION_CLASS: ReadonlySet<string> = new Set([
  EventTypes.DecisionStage,
  EventTypes.DecisionOutcome,
]);

export function isDecisionClass(t: string): boolean {
  return DECISION_CLASS.has(t);
}

/** Validate INV-E5 for decision-class events. */
export function decisionClassValid(e: EventInput): boolean {
  return !isDecisionClass(e.event_type) || (!!e.snapshot_id && !!e.correlation_id);
}
