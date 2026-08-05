import { reconstructCandles, type Trade } from '@genesis/data-layer';
import type { Version } from '@genesis/contracts';
import type { FeatureDefinition } from './types.js';

const v1 = '1.0.0' as Version;

/** Latest CLOSED 1m candle from as-of trades (INV-T2 via reconstruction). */
function latestClosed(ctx: { raw: readonly { payload: unknown }[]; symbol: string; asOfMs: number }) {
  const trades = ctx.raw.map((r) => r.payload as Trade).filter(Boolean);
  const candles = reconstructCandles(ctx.symbol, trades, '1m', ctx.asOfMs);
  return candles.length ? candles[candles.length - 1]! : null;
}

export const closeFeature: FeatureDefinition = {
  id: 'close_1m',
  version: v1,
  timeframe: '1m',
  dependencies: [],
  inputsRaw: ['trade'],
  transform: (ctx) => {
    if (ctx.quality.states.has('GapDetected')) return null; // handle degraded input
    const c = latestClosed(ctx);
    return c ? c.close : null;
  },
  provenance: { method_version: 'close_1m@1' },
};

export const rangeFeature: FeatureDefinition = {
  id: 'range_1m',
  version: v1,
  timeframe: '1m',
  dependencies: [],
  inputsRaw: ['trade'],
  transform: (ctx) => {
    const c = latestClosed(ctx);
    return c ? c.high - c.low : null;
  },
  provenance: { method_version: 'range_1m@1' },
};

/** Depends on close_1m + range_1m → exercises the dependency DAG + resolver. */
export const rangePctFeature: FeatureDefinition = {
  id: 'range_pct_1m',
  version: v1,
  dependencies: [
    { id: 'close_1m', version: v1 },
    { id: 'range_1m', version: v1 },
  ],
  inputsRaw: [],
  transform: (ctx) => {
    const close = ctx.upstream.get('close_1m');
    const range = ctx.upstream.get('range_1m');
    if (close == null || range == null || close === 0) return null;
    return range / close;
  },
  provenance: { method_version: 'range_pct_1m@1' },
};

export const SAMPLE_FEATURES: readonly FeatureDefinition[] = [
  closeFeature,
  rangeFeature,
  rangePctFeature,
];
