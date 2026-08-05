import type { UUID, Hash, ISOTimestamp, SnapshotId, CorrelationId } from './common.js';

// System Contracts §1 — common Event envelope. Concrete event types are defined in S3.
export type EventType = string; // enumerated in Event Engine (S3)

export interface EventEnvelope<TPayload = unknown> {
  event_id: UUID;
  event_type: EventType;
  event_time: ISOTimestamp; // exchange/occurrence time
  ingest_time: ISOTimestamp; // capture time (bitemporal)
  seq: number; // ordering
  source_engine: string;
  schema_version: number;
  snapshot_id?: SnapshotId; // decision-class events are snapshot-tagged
  correlation_id: CorrelationId;
  causation_id?: UUID;
  payload: TPayload;
  prev_hash?: Hash; // hash chain
  hash: Hash;
}
