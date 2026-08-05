import type { RawStore } from '@genesis/data-layer';
import { queryAsOf } from '@genesis/data-layer';
import type { FeatureDefinitionRegistry } from './registry.js';
import type { ResolvedPlan } from './resolver.js';
import type { FeatureCache } from './cache.js';
import { cacheKey } from './cache.js';
import { normalizeInput } from './quality.js';
import type { FeatureId, FeatureValue } from './types.js';
import type { Symbol } from '@genesis/data-layer';

export interface ComputeInputs {
  registry: FeatureDefinitionRegistry;
  plan: ResolvedPlan;
  store: RawStore;
  cache?: FeatureCache;
  symbol: Symbol;
  asOfMs: number;
}

/**
 * Compute all features in a resolved plan (topo order), as-of a point in time.
 * offline (past asOfMs) and online (asOfMs = now) use the SAME transform → skew 0.
 * INV-T1 (as-of read), INV-T2 (closed candles, enforced by data-layer reconstruction inside
 * transforms), INV-T4 (recompute from L1 on cache miss), INV-D1 (deterministic).
 */
export function computeFeatures(inp: ComputeInputs): Map<FeatureId, FeatureValue> {
  const { registry, plan, store, cache, symbol, asOfMs } = inp;
  const values = new Map<FeatureId, FeatureValue>();

  for (const ref of plan.order) {
    const key = cacheKey(ref, symbol, asOfMs);
    if (cache?.has(key)) {
      values.set(ref.id, cache.get(key)!);
      continue;
    }
    const def = registry.get(ref);
    const asOfRaw = queryAsOf(store, { asOfEventMs: asOfMs, symbol }).filter((r) =>
      def.inputsRaw.length === 0 ? true : def.inputsRaw.includes(r.kind),
    );
    const { records, report } = normalizeInput(asOfRaw);
    const value = def.transform({
      symbol,
      asOfMs,
      raw: records,
      upstream: values,
      quality: report,
    });
    values.set(ref.id, value);
    cache?.set(key, value);
  }
  return values;
}
