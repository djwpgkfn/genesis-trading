import { TF, type Candle, type Timeframe } from '../types.js';

export interface SeqGap {
  after_seq: number;
  before_seq: number;
  missing: number;
}

/** Detect missing sequence numbers in a per-stream ordered feed. */
export function detectSeqGaps(seqs: readonly number[]): SeqGap[] {
  const sorted = [...seqs].sort((a, b) => a - b);
  const out: SeqGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur - prev > 1) out.push({ after_seq: prev, before_seq: cur, missing: cur - prev - 1 });
  }
  return out;
}

export interface CandleGap {
  from_open_ms: number;
  to_open_ms: number;
  missing: number;
}

/** Detect missing candle windows (non-contiguous open_time steps of tf). */
export function detectCandleGaps(candles: readonly Candle[], tf: Timeframe): CandleGap[] {
  const tfMs = TF[tf];
  const times = [...new Set(candles.map((c) => c.open_time_ms))].sort((a, b) => a - b);
  const out: CandleGap[] = [];
  for (let i = 1; i < times.length; i++) {
    const prev = times[i - 1]!;
    const cur = times[i]!;
    const steps = (cur - prev) / tfMs;
    if (steps > 1) out.push({ from_open_ms: prev, to_open_ms: cur, missing: steps - 1 });
  }
  return out;
}
