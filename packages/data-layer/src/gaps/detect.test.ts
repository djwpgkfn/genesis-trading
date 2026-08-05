import { describe, it, expect } from 'vitest';
import { detectSeqGaps, detectCandleGaps } from './detect.js';
import type { Candle } from '../types.js';

describe('gap detection', () => {
  it('finds missing sequence numbers', () => {
    expect(detectSeqGaps([1, 2, 4, 7])).toEqual([
      { after_seq: 2, before_seq: 4, missing: 1 },
      { after_seq: 4, before_seq: 7, missing: 2 },
    ]);
  });
  it('finds missing candle windows', () => {
    const c = (open: number): Candle => ({
      symbol: 'KRW-BTC', tf: '1m', open_time_ms: open, open: 1, high: 1, low: 1, close: 1,
      volume: 0, acc_price: 0, source: 'reconstructed',
    });
    const gaps = detectCandleGaps([c(0), c(60_000), c(180_000)], '1m');
    expect(gaps).toEqual([{ from_open_ms: 60_000, to_open_ms: 180_000, missing: 1 }]);
  });
});
