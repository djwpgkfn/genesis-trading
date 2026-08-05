import type { Hash, ISOTimestamp, SnapshotId, Version } from './common.js';

// Constitution Part IV §9 — ProductionSnapshot pins EVERY decision-affecting element (incl. F4).
// Base type only in S0; producers/validators come later.
export interface ProductionSnapshot {
  snapshot_id: SnapshotId;
  strategy_versions: ReadonlyArray<{ id: string; version: Version }>;
  feature_set_version: Version;
  risk_config_version: Version;
  portfolio_config_version: Version;
  engine_version: Version;
  config_ref: Hash;
  mtf_weights_version: Version;
  market_health_config_version: Version;
  score_config_version: Version;
  memory_method_version: Version;
  correlation_method_version: Version;
  fee_schedule_version: Version;
  market_rules_version: Version;
  timezone: string;
  rng: { readonly seed: number } | 'none'; // no unpinned randomness (INV-D1)
  created_at: ISOTimestamp;
  hash: Hash;
}
