import { TF, type Candle, type Symbol, type Timeframe, type Trade } from '../types.js';

export function windowStart(tsMs: number, tfMs: number): number {
  return Math.floor(tsMs / tfMs) * tfMs;
}

/**
 * Deterministic tick→candle reconstruction (INV-T4 regenerable from L1).
 * Emits ONLY closed candles relative to `asOfMs` (INV-T2 no repaint):
 * window [start, start+tf) is closed iff start + tf <= asOfMs.
 */
export function reconstructCandles(
  symbol: Symbol,
  trades: readonly Trade[],
  tf: Timeframe,
  asOfMs: number,
): Candle[] {
  const tfMs = TF[tf];
  const byWindow = new Map<number, Trade[]>();
  for (const t of trades) {
    const w = windowStart(t.event_time_ms, tfMs);
    if (w + tfMs > asOfMs) continue; // not closed → skip
    const arr = byWindow.get(w);
    if (arr) arr.push(t);
    else byWindow.set(w, [t]);
  }
  const out: Candle[] = [];
  for (const [w, ts] of [...byWindow.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...ts].sort((a, b) => a.event_time_ms - b.event_time_ms || a.seq - b.seq);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let accPrice = 0;
    for (const t of sorted) {
      if (t.price > high) high = t.price;
      if (t.price < low) low = t.price;
      volume += t.volume;
      accPrice += t.price * t.volume;
    }
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    out.push({
      symbol,
      tf,
      open_time_ms: w,
      open: first.price,
      high,
      low,
      close: last.price,
      volume,
      acc_price: accPrice,
      source: 'reconstructed',
    });
  }
  return out;
}
