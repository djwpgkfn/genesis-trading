import type { UUID, Hash, ISOTimestamp, SnapshotId } from './common.js';

// System Contracts §6 — DeploymentManifest. Signed promotion unit (INV-V3).
export interface Approval {
  approver: string;
  role: string;
  at: ISOTimestamp;
  signature: string;
}
export interface DeploymentManifest {
  manifest_id: UUID;
  target_snapshot: SnapshotId;
  reason: string;
  evidence: { wfv_ref?: string; shadow_ref?: string; champion_challenger_ref?: string };
  approvals: ReadonlyArray<Approval>;
  rollback_to?: SnapshotId;
  created_at: ISOTimestamp;
  hash: Hash;
}
