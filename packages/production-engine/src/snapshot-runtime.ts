import type { ProductionSnapshot, Hash } from '@genesis/contracts';
import { contentHash } from '@genesis/event-engine';

const REQUIRED_PINS: readonly (keyof ProductionSnapshot)[] = [
  'feature_set_version', 'risk_config_version', 'portfolio_config_version', 'engine_version',
  'mtf_weights_version', 'market_health_config_version', 'score_config_version',
  'memory_method_version', 'correlation_method_version', 'fee_schedule_version',
  'market_rules_version', 'timezone',
];

/** INV-V5: every decision-affecting element must be pinned. */
export function verifyPins(s: ProductionSnapshot): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!s.strategy_versions || s.strategy_versions.length === 0) missing.push('strategy_versions');
  for (const k of REQUIRED_PINS) if (!s[k]) missing.push(String(k));
  return { ok: missing.length === 0, missing };
}

export function snapshotHash(s: Omit<ProductionSnapshot, 'hash'> & { hash?: Hash }): string {
  const { hash: _omit, ...rest } = s;
  return contentHash(rest);
}

/**
 * Holds the ACTIVE snapshot. Data Plane reads it (read-only). Only Control Plane may swap it,
 * atomically (INV-V2). Runtime never mutates a snapshot in place; a change is a NEW snapshot.
 */
export class SnapshotRuntime {
  private active: ProductionSnapshot | null = null;
  private previous: ProductionSnapshot | null = null;

  getActive(): ProductionSnapshot | null {
    return this.active;
  }
  /** Atomic activation. Verifies pins + hash before switching. */
  activate(s: ProductionSnapshot): void {
    const pins = verifyPins(s);
    if (!pins.ok) throw new Error(`Snapshot missing pins (INV-V5): ${pins.missing.join(',')}`);
    if (snapshotHash(s) !== s.hash) throw new Error('Snapshot hash mismatch');
    this.previous = this.active;
    this.active = s; // atomic swap (no partial state)
  }
  /** Atomic rollback to the prior snapshot (INV-V4). */
  rollback(): void {
    if (!this.previous) throw new Error('No prior snapshot to roll back to');
    const p = this.previous;
    this.previous = this.active;
    this.active = p;
  }
}
