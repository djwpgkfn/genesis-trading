import type { UUID, Hash, ISOTimestamp, SnapshotId, CorrelationId, Version } from './common.js';

// System Contracts §7 — DecisionRecord is a deterministic PROJECTION of events (not a source of truth).
// Score/risk detail is filled in later stages; S0 defines the traceable base.
export type DecisionAction = 'buy' | 'sell' | 'hold';

export interface DecisionRecord {
  decision_id: UUID;
  correlation_id: CorrelationId;
  event_time: ISOTimestamp;
  decided_at: ISOTimestamp;
  engine_version: Version;
  snapshot_id: SnapshotId;
  data_snapshot_ref: Hash;
  memory_snapshot_ref?: Hash; // F7 — Memory-influenced decisions fully traceable
  schema_version: number;
  source_event_ids: ReadonlyArray<UUID>; // back-trace to raw events
  outcome: { action: DecisionAction; reason: string };
  prev_hash?: Hash;
  hash: Hash;
}
