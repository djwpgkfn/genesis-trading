import type { FeatureDefinitionRegistry } from './registry.js';
import type { FeatureRef } from './types.js';
import { refKey } from './types.js';

/**
 * Build a topological order over the transitive dependency closure of `roots`.
 * Throws on cycle (features must form a DAG → deterministic, reproducible computation).
 */
export function topoOrder(
  registry: FeatureDefinitionRegistry,
  roots: readonly FeatureRef[],
): FeatureRef[] {
  const order: FeatureRef[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const byKey = new Map<string, FeatureRef>();

  const visit = (ref: FeatureRef): void => {
    const key = refKey(ref);
    const s = state.get(key);
    if (s === 'done') return;
    if (s === 'visiting') throw new Error(`Feature dependency cycle at ${key}`);
    state.set(key, 'visiting');
    const def = registry.get(ref);
    for (const dep of def.dependencies) visit(dep);
    state.set(key, 'done');
    byKey.set(key, ref);
    order.push(ref);
  };

  for (const r of roots) visit(r);
  return order;
}

/** True if the closure of `roots` is acyclic and all deps resolvable. */
export function isDag(registry: FeatureDefinitionRegistry, roots: readonly FeatureRef[]): boolean {
  try {
    topoOrder(registry, roots);
    return true;
  } catch {
    return false;
  }
}
