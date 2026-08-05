import type { DeploymentManifest, ProductionSnapshot } from '@genesis/contracts';
import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { SnapshotRuntime } from './snapshot-runtime.js';
import { verifyManifest } from './manifest.js';

/**
 * Control Plane: the ONLY path that changes the active snapshot. Verifies manifest (INV-V3),
 * then activates atomically (INV-V2). Champion swap = activating a new snapshot. Rollback is atomic.
 */
export class ControlPlane {
  private n = 0;
  constructor(
    private readonly snapshots: SnapshotRuntime,
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly now: () => string = () => new Date(0).toISOString(),
  ) {}

  eventLog(): EventStore {
    return this.log;
  }

  deploy(
    manifest: DeploymentManifest,
    target: ProductionSnapshot,
  ): { ok: boolean; reasons: string[] } {
    const verdict = verifyManifest(manifest, target);
    if (!verdict.ok) {
      this.emit('Deployment.rejected', target.snapshot_id, { reasons: verdict.reasons });
      return verdict;
    }
    this.snapshots.activate(target); // atomic
    this.emit('Snapshot.activated', target.snapshot_id, {
      snapshot_id: target.snapshot_id,
      manifest_id: manifest.manifest_id,
    });
    return { ok: true, reasons: [] };
  }

  /** Champion swap is just a controlled snapshot activation (same signed path). */
  championSwap(
    manifest: DeploymentManifest,
    target: ProductionSnapshot,
  ): { ok: boolean; reasons: string[] } {
    return this.deploy(manifest, target);
  }

  rollback(): void {
    this.snapshots.rollback();
    const active = this.snapshots.getActive();
    this.emit('Snapshot.rolledBack', active?.snapshot_id ?? 'none', {
      to: active?.snapshot_id ?? null,
    });
  }

  private emit(type: string, snap: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`cp-${type}-${++this.n}`),
      event_type: type,
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'control-plane',
      schema_version: 1,
      correlation_id: asCorrelationId('control-plane'),
      snapshot_id: asSnapshotId(String(snap)),
      payload,
    };
    this.log.append(input);
  }
}
