import type { Candle as DataLayerCandle } from '@genesis/data-layer';
import type { Candle as SignalCandle } from '@genesis/signal-engine';

/**
 * I4-7B-3 Candle type bridge.
 *
 * The market-data layer and the Trading Core use DIFFERENT candle types:
 *
 *   data-layer  Candle: { symbol, tf, open_time_ms, open, high, low, close, volume, acc_price, source }
 *   signal-engine Candle: { open, high, low, close, volume, time_ms }
 *
 * Differences handled explicitly here — no implicit cast anywhere else in the paper pipeline:
 *   - `open_time_ms` (window START, inclusive) becomes `time_ms`. The window end is NOT used:
 *     `reconstructCandles` only ever emits CLOSED windows (INV-T2 no repaint), so the start is a
 *     deterministic, already-final stamp. Re-deriving an end time would change the field's meaning.
 *   - `symbol`, `tf`, `acc_price`, `source` have no counterpart in the Trading Core candle and are
 *     intentionally dropped (symbol travels separately on MarketSnapshot).
 *   - OHLCV values are carried across unchanged (no rounding, no unit conversion; both are plain
 *     numbers in exchange units and epoch milliseconds).
 *
 * Invalid candles are rejected rather than silently passed through.
 */

/** Why a candle was rejected (explicit — never a silent skip). */
export type CandleRejectReason =
  | 'non-finite-number'
  | 'negative-volume'
  | 'high-below-low'
  | 'close-out-of-range'
  | 'open-out-of-range'
  | 'invalid-timestamp';

export type CandleBridgeResult =
  | { candle: SignalCandle; rejected: null }
  | { candle: null; rejected: CandleRejectReason };

function finite(...xs: number[]): boolean {
  return xs.every((x) => Number.isFinite(x));
}

/** Convert ONE data-layer candle into the Trading Core candle, or explain why it cannot be. */
export function toSignalCandle(c: DataLayerCandle): CandleBridgeResult {
  if (!finite(c.open, c.high, c.low, c.close, c.volume, c.open_time_ms)) {
    return { candle: null, rejected: 'non-finite-number' };
  }
  if (!Number.isFinite(c.open_time_ms) || c.open_time_ms < 0) {
    return { candle: null, rejected: 'invalid-timestamp' };
  }
  if (c.volume < 0) return { candle: null, rejected: 'negative-volume' };
  if (c.high < c.low) return { candle: null, rejected: 'high-below-low' };
  if (c.close > c.high || c.close < c.low) return { candle: null, rejected: 'close-out-of-range' };
  if (c.open > c.high || c.open < c.low) return { candle: null, rejected: 'open-out-of-range' };
  return {
    candle: {
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      time_ms: c.open_time_ms, // window start — already closed (INV-T2)
    },
    rejected: null,
  };
}

/** Convert a series, collecting rejects instead of hiding them. */
export function toSignalCandles(candles: readonly DataLayerCandle[]): {
  candles: SignalCandle[];
  rejected: { index: number; reason: CandleRejectReason }[];
} {
  const out: SignalCandle[] = [];
  const rejected: { index: number; reason: CandleRejectReason }[] = [];
  for (const [index, c] of candles.entries()) {
    const r = toSignalCandle(c);
    if (r.candle) out.push(r.candle);
    else rejected.push({ index, reason: r.rejected });
  }
  return { candles: out, rejected };
}
