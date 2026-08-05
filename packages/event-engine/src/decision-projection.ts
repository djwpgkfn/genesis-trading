import type { DecisionRecord, DecisionAction } from '@genesis/contracts';
import {
  asUUID,
  asHash,
  asISOTimestamp,
  asSnapshotId,
  asCorrelationId,
  asVersion,
  CONTRACTS_SCHEMA_VERSION,
} from '@genesis/contracts';
import { contentHash } from './hash.js';
import { EventTypes, type StoredEvent } from './events.js';

/**
 * Folds all events of a single correlation_id into a DecisionRecord (a PROJECTION, not truth).
 * Back-traceable via source_event_ids (INV-E4). Deterministic given the same events.
 */
export function projectDecision(events: readonly StoredEvent[]): DecisionRecord | null {
  if (events.length === 0) return null;
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const correlation_id = ordered[0]!.correlation_id;
  const snapshotEvt = ordered.find((e) => e.snapshot_id);
  const outcomeEvt = ordered.find((e) => e.event_type === EventTypes.DecisionOutcome);
  const outcome = (outcomeEvt?.payload ?? { action: 'hold', reason: 'no outcome event' }) as {
    action: DecisionAction;
    reason: string;
  };

  const rec: Omit<DecisionRecord, 'hash'> = {
    decision_id: asUUID(`decision:${correlation_id}`),
    correlation_id: asCorrelationId(String(correlation_id)),
    event_time: asISOTimestamp(ordered[0]!.event_time),
    decided_at: asISOTimestamp(ordered[ordered.length - 1]!.event_time),
    engine_version: asVersion('0.0.0'),
    snapshot_id: asSnapshotId(String(snapshotEvt?.snapshot_id ?? 'unknown')),
    data_snapshot_ref: asHash('n/a'),
    schema_version: CONTRACTS_SCHEMA_VERSION,
    source_event_ids: ordered.map((e) => e.event_id),
    outcome: { action: outcome.action, reason: outcome.reason },
  };
  return { ...rec, hash: asHash(contentHash(rec)) };
}
