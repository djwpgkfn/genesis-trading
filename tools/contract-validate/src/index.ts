// Contract validation tool (S0 skeleton).
// Verifies that contract base types are importable and self-consistent.
// Real schema/shape validation (e.g. runtime guards, JSON-schema export) is added S3.
import type {
  EventEnvelope,
  ProductionSnapshot,
  DeploymentManifest,
  DecisionRecord,
} from '@genesis/contracts';

// Compile-time presence check: if any base type is removed/renamed, this file fails to build,
// which fails `contract:validate` in CI.
type _AssertContracts = [EventEnvelope, ProductionSnapshot, DeploymentManifest, DecisionRecord];

console.log('[contract-validate] contract base types present and consistent. (S0 skeleton)');
process.exit(0);
