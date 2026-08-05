import type { FeatureDefinitionRegistry } from './registry.js';
import type { FeatureRef, FeatureSet } from './types.js';
import { refKey } from './types.js';
import { topoOrder } from './dag.js';

export interface ResolvedPlan {
  set_id: string;
  set_version: string;
  order: FeatureRef[]; // topo-sorted, all versions pinned
  plan_key: string;    // stable id of the exact resolved plan (for Snapshot pinning / cache)
}

/**
 * Resolve a FeatureSet@version into a fully-pinned, topo-ordered computation plan.
 * Every feature (incl. transitive deps) resolves to an explicit version (INV-V5 pin, INV-D1).
 */
export function resolveSet(registry: FeatureDefinitionRegistry, set: FeatureSet): ResolvedPlan {
  // Validate presence up-front.
  for (const f of set.features) registry.get(f);
  const order = topoOrder(registry, set.features);
  const plan_key = `${set.id}@${set.version}:` + order.map(refKey).join(',');
  return { set_id: set.id, set_version: set.version, order, plan_key };
}
