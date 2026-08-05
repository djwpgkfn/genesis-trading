import { describe, it, expect } from 'vitest';
import { InMemoryRawStore, type RawRecord, type Trade } from '@genesis/data-layer';
import { FeatureDefinitionRegistry } from './registry.js';
import { resolveSet } from './resolver.js';
import { InMemoryFeatureCache } from './cache.js';
import { computeFeatures } from './compute.js';
import { SAMPLE_FEATURES } from './features.samples.js';
import type { Version } from '@genesis/contracts';

const v1 = '1.0.0' as Version;
const iso = (ms: number) => new Date(ms).toISOString() as RawRecord['event_time'];
function store(): InMemoryRawStore {
  const s = new InMemoryRawStore();
  const trades: Trade[] = [
    { symbol: 'KRW-BTC', event_time_ms: 1_000, price: 100, volume: 1, side: 'bid', seq: 1 },
    { symbol: 'KRW-BTC', event_time_ms: 30_000, price: 120, volume: 1, side: 'ask', seq: 2 },
    { symbol: 'KRW-BTC', event_time_ms: 59_000, price: 90, volume: 1, side: 'bid', seq: 3 },
  ];
  for (const t of trades)
    s.append({ kind: 'trade', symbol: t.symbol, event_time: iso(t.event_time_ms), ingest_time: iso(t.event_time_ms), event_time_ms: t.event_time_ms, ingest_time_ms: t.event_time_ms, seq: t.seq, payload: t });
  return s;
}

describe('compute (offline=online parity, cache correctness)', () => {
  it('computes DAG feature range_pct = range/close', () => {
    const reg = new FeatureDefinitionRegistry();
    SAMPLE_FEATURES.forEach((f) => reg.register(f));
    const plan = resolveSet(reg, { id: 's', version: v1, features: [{ id: 'range_pct_1m', version: v1 }] });
    const v = computeFeatures({ registry: reg, plan, store: store(), symbol: 'KRW-BTC', asOfMs: 120_000 });
    expect(v.get('close_1m')).toBe(90);
    expect(v.get('range_1m')).toBe(30); // high120 - low90
    expect(v.get('range_pct_1m')).toBeCloseTo(30 / 90, 12);
  });

  it('cache == recompute (INV-T4)', () => {
    const reg = new FeatureDefinitionRegistry();
    SAMPLE_FEATURES.forEach((f) => reg.register(f));
    const plan = resolveSet(reg, { id: 's', version: v1, features: [{ id: 'range_pct_1m', version: v1 }] });
    const cache = new InMemoryFeatureCache();
    const s = store();
    const a = computeFeatures({ registry: reg, plan, store: s, cache, symbol: 'KRW-BTC', asOfMs: 120_000 });
    const b = computeFeatures({ registry: reg, plan, store: s, symbol: 'KRW-BTC', asOfMs: 120_000 });
    expect(a.get('range_pct_1m')).toBe(b.get('range_pct_1m'));
    expect(cache.size()).toBeGreaterThan(0);
  });
});
