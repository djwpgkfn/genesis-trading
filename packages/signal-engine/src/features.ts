// Pure, deterministic feature math (no Date.now / Math.random). Neutral results when data is short.
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

export function macd(closes: readonly number[]): { macd: number; signal: number; hist: number } | null {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  if (e12 === null || e26 === null) return null;
  const macdLine = e12 - e26;
  // signal = EMA9 of the macd series (approximated from the last 9 diffs)
  const diffs: number[] = [];
  for (let n = 26; n <= closes.length; n++) {
    const a = ema(closes.slice(0, n), 12);
    const b = ema(closes.slice(0, n), 26);
    if (a !== null && b !== null) diffs.push(a - b);
  }
  const signal = ema(diffs, Math.min(9, diffs.length)) ?? macdLine;
  return { macd: macdLine, signal, hist: macdLine - signal };
}

export function bollinger(closes: readonly number[], period = 20, mult = 2): { mid: number; upper: number; lower: number } | null {
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

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
