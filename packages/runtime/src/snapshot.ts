import type { RawRecord } from '@genesis/data-layer';
import type { Candle, MarketSnapshot } from '@genesis/signal-engine';

/**
 * Pure, deterministic snapshot builder: raw ticks/trades → OHLCV candles → MarketSnapshot.
 * Past-only (event_time_ms <= asOfMs) so Live and Replay produce identical snapshots. No IO/clock/rng.
 */
export function buildMarketSnapshot(
  records: readonly RawRecord[],
  symbol: string,
  asOfMs: number,
  tfMs = 60_000,
  count = 60,
): MarketSnapshot {
  const buckets = new Map<number, Candle>();
  for (const r of records) {
    if (r.symbol !== symbol || r.event_time_ms > asOfMs) continue;
    if (r.kind !== 'trade' && r.kind !== 'ticker') continue;
    const p = r.payload as Record<string, unknown>;
    const price = Number(p['trade_price'] ?? p['close'] ?? 0);
    if (!price) continue;
    const vol = Number(p['trade_volume'] ?? p['volume'] ?? p['acc_trade_volume'] ?? 0);
    const t = Math.floor(r.event_time_ms / tfMs) * tfMs;
    const b = buckets.get(t);
    if (!b)
      buckets.set(t, {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: vol,
        time_ms: t,
      });
    else {
      b.high = Math.max(b.high, price);
      b.low = Math.min(b.low, price);
      b.close = price;
      b.volume += vol;
    }
  }
  const candles = [...buckets.values()].sort((a, b) => a.time_ms - b.time_ms).slice(-count);
  return { symbol, timestamp_ms: asOfMs, candles };
}
