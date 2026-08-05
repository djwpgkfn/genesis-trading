import type { Version } from '@genesis/contracts';
import type { MarketDataKind, RawRecord, Symbol, Timeframe } from '@genesis/data-layer';
import type { QualityReport } from './quality.js';

export type FeatureId = string;
export interface FeatureRef {
  id: FeatureId;
  version: Version;
}
export const refKey = (r: FeatureRef): string => `${r.id}@${r.version}`;

/** null = input insufficient / quality too degraded to emit (handled downstream, e.g. 관망). */
export type FeatureValue = number | null;

export interface FeatureContext {
  symbol: Symbol;
  asOfMs: number;
  raw: readonly RawRecord[]; // as-of, quality-normalized (deduped, ordered)
  upstream: ReadonlyMap<FeatureId, FeatureValue>;
  quality: QualityReport;
}

export interface FeatureDefinition {
  id: FeatureId;
  version: Version;
  timeframe?: Timeframe;
  dependencies: readonly FeatureRef[]; // upstream features (DAG edges)
  inputsRaw: readonly MarketDataKind[]; // raw kinds required
  /** Pure, deterministic. No Date.now / Math.random (P2, INV-D1). */
  transform: (ctx: FeatureContext) => FeatureValue;
  provenance: { method_version: string };
}

export interface FeatureSet {
  id: string;
  version: Version;
  features: readonly FeatureRef[];
}
