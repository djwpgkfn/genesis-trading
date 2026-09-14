import type { Candle, MarketSnapshot } from '@genesis/signal-engine';

/**
 * I4-7B-2b deterministic market fixtures.
 *
 * These build candle sequences that make the REAL indicator math (feature-store) emit real signals.
 * NOTHING in the engines, periods or thresholds was changed to force a signal — only the data is
 * designed. Minimum lengths come from the actual implementations: ema(21) needs 21, rsi(14) needs
 * 15, macd needs ema(26) → 26, bollinger/volatility/volumeRatio/trendSlope need 20-21, so 30
 * candles activate all of them.
 *
 * Why the bullish fixture has pullbacks: a strictly monotonic rise drives rsi(14) to 100, which
 * fires RSI_OVERBOUGHT (value -1, strength 1) and makes the DecisionEngine's net conviction
 * NEGATIVE — the real engines would not produce BUY. A 3-up/1-down pattern keeps the trend and the
 * EMA/MACD signals positive while the net stays above the 0.15 threshold, which is what a real
 * bullish-but-not-parabolic market looks like.
 */

export const FIXTURE_SYMBOL = 'KRW-BTC';

interface SeriesOptions {
  count?: number;
  start?: number;
  upPct?: number;
  downPct?: number;
  /** Volume for the last candle (a spike makes volumeRatio > 1.5 → HIGH_VOLUME). */
  lastVolume?: number;
  baseVolume?: number;
}

function series(isDown: (i: number) => boolean, o: SeriesOptions = {}): Candle[] {
  const count = o.count ?? 30;
  const upPct = o.upPct ?? 0.01;
  const downPct = o.downPct ?? 0.009;
  const baseVolume = o.baseVolume ?? 100;
  const lastVolume = o.lastVolume ?? baseVolume;
  const out: Candle[] = [];
  let close = o.start ?? 100_000;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = Math.round(open * (1 + (isDown(i) ? -downPct : upPct)));
    out.push({
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: i === count - 1 ? lastVolume : baseVolume,
      time_ms: (i + 1) * 60_000,
    });
  }
  return out;
}

/**
 * Bullish market: 3 up / 1 pullback with a closing volume spike.
 * Verified against the real indicators to yield EMA_CROSS(+), MACD_BULLISH(+), TREND_UP(+),
 * HIGH_VOLUME(+) against RSI_OVERBOUGHT(-), with net conviction ≈ +0.61 → DecisionEngine BUY.
 */
export function bullishCandles(count = 30): Candle[] {
  return series((i) => i % 4 === 3, { count, upPct: 0.01, downPct: 0.009, lastVolume: 300 });
}

/** Bearish market: mirror of the bullish pattern (3 down / 1 bounce) → negative net → SELL side. */
export function bearishCandles(count = 30): Candle[] {
  return series((i) => i % 4 !== 3, { count, upPct: 0.009, downPct: 0.01, lastVolume: 300 });
}

/** Flat market: no directional conviction → HOLD. */
export function flatCandles(count = 30, price = 100_000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 100,
    time_ms: (i + 1) * 60_000,
  }));
}

/** Assemble a MarketSnapshot exactly as the SignalEngine expects it. */
export function snapshotOf(candles: Candle[], symbol = FIXTURE_SYMBOL): MarketSnapshot {
  return {
    symbol,
    timestamp_ms: candles[candles.length - 1]?.time_ms ?? 0,
    candles,
  };
}
