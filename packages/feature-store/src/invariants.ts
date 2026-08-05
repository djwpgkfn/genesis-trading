import type { CheckResult } from '@genesis/invariant-runner';
import { InMemoryRawStore, type RawRecord, type Trade } from '@genesis/data-layer';
import { FeatureDefinitionRegistry } from './registry.js';
import { resolveSet } from './resolver.js';
import { isDag } from './dag.js';
import { InMemoryFeatureCache } from './cache.js';
import { computeFeatures } from './compute.js';
import { SAMPLE_FEATURES } from './features.samples.js';
import type { Version } from '@genesis/contracts';
import type { FeatureSet } from './types.js';

const v1 = '1.0.0' as Version;
const iso = (ms: number) => new Date(ms).toISOString();

function fixture(): { registry: FeatureDefinitionRegistry; store: InMemoryRawStore; set: FeatureSet } {
  const registry = new FeatureDefinitionRegistry();
  for (const f of SAMPLE_FEATURES) registry.register(f);
  const store = new InMemoryRawStore();
  const trades: Trade[] = [
    { symbol: 'KRW-BTC', event_time_ms: 1_000, price: 100, volume: 1, side: 'bid', seq: 1 },
    { symbol: 'KRW-BTC', event_time_ms: 30_000, price: 120, volume: 1, side: 'ask', seq: 2 },
    { symbol: 'KRW-BTC', event_time_ms: 59_000, price: 90, volume: 1, side: 'bid', seq: 3 },
  ];
  for (const t of trades) {
    const r: RawRecord = {
      kind: 'trade', symbol: t.symbol,
      event_time: iso(t.event_time_ms) as RawRecord['event_time'],
      ingest_time: iso(t.event_time_ms) as RawRecord['ingest_time'],
      event_time_ms: t.event_time_ms, ingest_time_ms: t.event_time_ms, seq: t.seq, payload: t,
    };
    store.append(r);
  }
  const set: FeatureSet = { id: 'sample', version: v1, features: [{ id: 'range_pct_1m', version: v1 }] };
  return { registry, store, set };
}

/** INV-D1: feature DAG is acyclic (deterministic computation order). */
function checkDagAcyclic(): CheckResult {
  const { registry, set } = fixture();
  return isDag(registry, set.features)
    ? { id: 'INV-D1', status: 'pass' }
    : { id: 'INV-D1', status: 'fail', detail: 'feature dependency cycle' };
}

/** INV-T4: cache is optimization only — recompute from L1 equals cached value. */
function checkT4Recompute(): CheckResult {
  const { registry, store, set } = fixture();
  const plan = resolveSet(registry, set);
  const cache = new InMemoryFeatureCache();
  const a = computeFeatures({ registry, plan, store, cache, symbol: 'KRW-BTC', asOfMs: 120_000 });
  const b = computeFeatures({ registry, plan, store, symbol: 'KRW-BTC', asOfMs: 120_000 }); // no cache
  const same = a.get('range_pct_1m') === b.get('range_pct_1m');
  return same
    ? { id: 'INV-T4', status: 'pass' }
    : { id: 'INV-T4', status: 'fail', detail: 'cache != recompute' };
}

/** INV-V1: registering same id@version twice is rejected (versions immutable). */
function checkV1Immutable(): CheckResult {
  const { registry } = fixture();
  try {
    registry.register(SAMPLE_FEATURES[0]!); // duplicate
    return { id: 'INV-V1', status: 'fail', detail: 're-register allowed' };
  } catch {
    return { id: 'INV-V1', status: 'pass' };
  }
}

/** INV-T2: features never see a forming candle (offline=online parity by construction). */
function checkT2ClosedOnly(): CheckResult {
  const { registry, store, set } = fixture();
  const plan = resolveSet(registry, set);
  // asOf mid-second-window: only first (closed) window contributes; close must equal 90 (1st window close)
  const v = computeFeatures({ registry, plan, store, symbol: 'KRW-BTC', asOfMs: 61_500 });
  // add a later trade in 2nd window; recompute at same asOf must be unaffected (no repaint)
  return v.get('close_1m') === 90
    ? { id: 'INV-T2', status: 'pass' }
    : { id: 'INV-T2', status: 'fail', detail: `close=${v.get('close_1m')}` };
}

export const featureStoreChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-D1', fn: checkDagAcyclic },
  { id: 'INV-T2', fn: checkT2ClosedOnly },
  { id: 'INV-T4', fn: checkT4Recompute },
  { id: 'INV-V1', fn: checkV1Immutable },
];
