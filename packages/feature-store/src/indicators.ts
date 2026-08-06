// Canonical, pure, deterministic indicator math — the single source of feature computation.
// No Date.now / Math.random / IO. Neutral (null) results when data is too short.
export function sma(values: readonly number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values: readonly number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i]! * k + e * (1 - k);
  return e;
}

export function rsi(closes: readonly number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (gains + losses === 0) return 50;
  const rs = gains / (losses || 1e-9);
  return 100 - 100 / (1 + rs);
}

export function macd(
  closes: readonly number[],
): { macd: number; signal: number; hist: number } | null {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  if (e12 === null || e26 === null) return null;
  const macdLine = e12 - e26;
  const diffs: number[] = [];
  for (let n = 26; n <= closes.length; n++) {
    const a = ema(closes.slice(0, n), 12);
    const b = ema(closes.slice(0, n), 26);
    if (a !== null && b !== null) diffs.push(a - b);
  }
  const signal = ema(diffs, Math.min(9, diffs.length)) ?? macdLine;
  return { macd: macdLine, signal, hist: macdLine - signal };
}

export function bollinger(
  closes: readonly number[],
  period = 20,
  mult = 2,
): { mid: number; upper: number; lower: number } | null {
  const mid = sma(closes, period);
  if (mid === null) return null;
  const slice = closes.slice(closes.length - period);
  const variance = slice.reduce((a, c) => a + (c - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd };
}

export function volatility(closes: readonly number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    rets.push((closes[i]! - closes[i - 1]!) / (closes[i - 1]! || 1e-9));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(v);
}

export function volumeRatio(volumes: readonly number[], period = 20): number | null {
  const avg = sma(volumes, period);
  if (avg === null || avg === 0) return null;
  return volumes[volumes.length - 1]! / avg;
}

/** Sign and magnitude of a simple linear trend over the last `period` closes. */
export function trendSlope(closes: readonly number[], period = 20): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const n = slice.length;
  const xMean = (n - 1) / 2;
  const yMean = slice.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (slice[i]! - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Average volume over the last `period` bars. */
export const volumeAverage = (volumes: readonly number[], period = 20): number | null =>
  sma(volumes, period);

/** Average True Range over `period` bars. */
export function atr(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  period = 14,
): number | null {
  const n = closes.length;
  if (n < period + 1 || highs.length !== n || lows.length !== n) return null;
  const trs: number[] = [];
  for (let i = n - period; i < n; i++) {
    const tr = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / period;
}

/** Volume-weighted average price over the provided (typical) prices and volumes. */
export function vwap(prices: readonly number[], volumes: readonly number[]): number | null {
  if (prices.length === 0 || prices.length !== volumes.length) return null;
  let pv = 0;
  let v = 0;
  for (let i = 0; i < prices.length; i++) {
    pv += prices[i]! * volumes[i]!;
    v += volumes[i]!;
  }
  return v === 0 ? null : pv / v;
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Minimal candle shape (structural — no engine import, avoids dependency cycle). */
export interface IndicatorCandle {
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Full indicator set for a candle window. Pure & as-of (uses only the candles passed in). */
export interface IndicatorSet {
  ema9: number | null;
  ema21: number | null;
  sma20: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; hist: number } | null;
  bollinger: { mid: number; upper: number; lower: number } | null;
  volatility: number | null;
  volumeRatio: number | null;
  volumeAverage: number | null;
  trendSlope: number | null;
  atr14: number | null;
  vwap: number | null;
}

/** Feature Store's single entry point: candles → the full indicator set (as-of, deterministic). */
export function computeIndicators(candles: readonly IndicatorCandle[]): IndicatorSet {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const typical = candles.map((c) => (c.high + c.low + c.close) / 3);
  return {
    ema9: ema(closes, 9),
    ema21: ema(closes, 21),
    sma20: sma(closes, 20),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    bollinger: bollinger(closes),
    volatility: volatility(closes),
    volumeRatio: volumeRatio(volumes),
    volumeAverage: volumeAverage(volumes),
    trendSlope: trendSlope(closes),
    atr14: atr(highs, lows, closes, 14),
    vwap: vwap(typical, volumes),
  };
}
