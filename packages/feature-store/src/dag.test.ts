import { describe, it, expect } from 'vitest';
import { FeatureDefinitionRegistry } from './registry.js';
import { topoOrder, isDag } from './dag.js';
import { SAMPLE_FEATURES } from './features.samples.js';
import type { Version } from '@genesis/contracts';

const v1 = '1.0.0' as Version;

describe('feature DAG', () => {
  it('topo-orders dependencies before dependents', () => {
    const reg = new FeatureDefinitionRegistry();
    SAMPLE_FEATURES.forEach((f) => reg.register(f));
    const order = topoOrder(reg, [{ id: 'range_pct_1m', version: v1 }]).map((r) => r.id);
    expect(order.indexOf('close_1m')).toBeLessThan(order.indexOf('range_pct_1m'));
    expect(order.indexOf('range_1m')).toBeLessThan(order.indexOf('range_pct_1m'));
  });

  it('detects cycles', () => {
    const reg = new FeatureDefinitionRegistry();
    reg.register({ id: 'a', version: v1, dependencies: [{ id: 'b', version: v1 }], inputsRaw: [], transform: () => 0, provenance: { method_version: 'a' } });
    reg.register({ id: 'b', version: v1, dependencies: [{ id: 'a', version: v1 }], inputsRaw: [], transform: () => 0, provenance: { method_version: 'b' } });
    expect(isDag(reg, [{ id: 'a', version: v1 }])).toBe(false);
  });
});
