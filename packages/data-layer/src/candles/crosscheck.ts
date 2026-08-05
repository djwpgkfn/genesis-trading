import type { Candle } from '../types.js';

export interface CandleMismatch {
  open_time_ms: number;
  field: keyof Candle;
  reconstructed: number;
  rest: number;
}

/** Compare reconstructed vs REST candles (DoD: 재구성=REST 일치). */
export function crosscheckCandles(
  reconstructed: readonly Candle[],
  rest: readonly Candle[],
  tolerance = 1e-8,
): CandleMismatch[] {
  const restByTime = new Map(rest.map((c) => [c.open_time_ms, c]));
  const out: CandleMismatch[] = [];
  for (const rc of reconstructed) {
    const rr = restByTime.get(rc.open_time_ms);
    if (!rr) continue;
    for (const f of ['open', 'high', 'low', 'close', 'volume'] as const) {
      if (Math.abs(rc[f] - rr[f]) > tolerance) {
        out.push({ open_time_ms: rc.open_time_ms, field: f, reconstructed: rc[f], rest: rr[f] });
      }
    }
  }
  return out;
}
