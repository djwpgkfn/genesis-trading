import { describe, it, expect } from 'vitest';
import { reconstructCandles } from './reconstruct.js';
import type { Trade } from '../types.js';

const t = (ms: number, price: number, volume: number, seq: number): Trade => ({
  symbol: 'KRW-BTC',
  event_time_ms: ms,
  price,
  volume,
  side: 'bid',
  seq,
});

describe('reconstructCandles', () => {
  it('builds OHLCV for a closed 1m window', () => {
    const trades = [t(1_000, 100, 1, 1), t(30_000, 120, 2, 2), t(59_000, 90, 1, 3)];
    const c = reconstructCandles('KRW-BTC', trades, '1m', 120_000);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ open: 100, high: 120, low: 90, close: 90, volume: 4 });
    expect(c[0]!.acc_price).toBe(100 * 1 + 120 * 2 + 90 * 1);
  });

  it('omits forming (unclosed) windows — no repaint (INV-T2)', () => {
    const trades = [t(1_000, 100, 1, 1), t(61_000, 110, 1, 2)];
    const c = reconstructCandles('KRW-BTC', trades, '1m', 61_500);
    expect(c.map((x) => x.open_time_ms)).toEqual([0]); // only first window closed
  });

  it('is deterministic regardless of input order (INV-T4)', () => {
    const trades = [t(10, 100, 2, 1), t(30, 105, 1, 2)];
    const a = reconstructCandles('KRW-BTC', trades, '1m', 120_000);
    const b = reconstructCandles('KRW-BTC', [...trades].reverse(), '1m', 120_000);
    expect(a).toEqual(b);
  });
});
