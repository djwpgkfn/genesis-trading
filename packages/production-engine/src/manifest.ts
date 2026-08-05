import type { DeploymentManifest, ProductionSnapshot } from '@genesis/contracts';
import { verifyPins, snapshotHash } from './snapshot-runtime.js';

export interface ManifestVerdict {
  ok: boolean;
  reasons: string[];
}

/** INV-V3: no deploy without a valid, signed, gate-backed manifest targeting a pinned snapshot. */
export function verifyManifest(m: DeploymentManifest, target: ProductionSnapshot): ManifestVerdict {
  const reasons: string[] = [];
  if (m.approvals.length === 0) reasons.push('no approvals');
  if (m.approvals.some((a) => !a.signature)) reasons.push('unsigned approval');
  if (String(m.target_snapshot) !== String(target.snapshot_id))
    reasons.push('target snapshot mismatch');
  if (snapshotHash(target) !== target.hash) reasons.push('snapshot hash mismatch');
  if (!m.evidence.wfv_ref) reasons.push('missing WFV gate evidence');
  const pins = verifyPins(target);
  if (!pins.ok) reasons.push(`unpinned: ${pins.missing.join(',')}`);
  return { ok: reasons.length === 0, reasons };
}
