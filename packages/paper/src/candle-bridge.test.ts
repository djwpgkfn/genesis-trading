import { describe, it, expect } from 'vitest';
import { toSignalCandle, toSignalCandles } from './candle-bridge.js';
import { reconstructCandles, type Candle as DataLayerCandle, type Trade } from '@genesis/data-layer';

function dlCandle(over: Partial<DataLayerCandle> = {}): DataLayerCandle {
  return {
    symbol: 'KRW-BTC',
    tf: '1m',
    open_time_ms: 60_000,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 3,
    acc_price: 315,
    source: 'reconstructed',
    ...over,
  };
}

describe('I4-7B-3: candle type bridge', () => {
  it('maps OHLCV unchanged and open_time_ms → time_ms', () => {
    const r = toSignalCandle(dlCandle());
    expect(r.rejected).toBeNull();
    expect(r.candle).toEqual({ open: 100, high: 110, low: 95, close: 105, volume: 3, time_ms: 60_000 });
  });

  it('drops data-layer-only fields (symbol/tf/acc_price/source)', () => {
    const c = toSignalCandle(dlCandle()).candle!;
    expect(c).not.toHaveProperty('symbol');
    expect(c).not.toHaveProperty('tf');
    expect(c).not.toHaveProperty('acc_price');
    expect(c).not.toHaveProperty('source');
  });

  it('rejects non-finite numbers', () => {
    expect(toSignalCandle(dlCandle({ close: Number.NaN })).rejected).toBe('non-finite-number');
    expect(toSignalCandle(dlCandle({ high: Number.POSITIVE_INFINITY })).rejected).toBe('non-finite-number');
  });

  it('rejects negative volume', () => {
    expect(toSignalCandle(dlCandle({ volume: -1 })).rejected).toBe('negative-volume');
  });

  it('rejects high < low and out-of-range open/close', () => {
    expect(toSignalCandle(dlCandle({ high: 90, low: 100 })).rejected).toBe('high-below-low');
    expect(toSignalCandle(dlCandle({ close: 200 })).rejected).toBe('close-out-of-range');
    expect(toSignalCandle(dlCandle({ open: 10 })).rejected).toBe('open-out-of-range');
  });

  it('rejects negative timestamps', () => {
    expect(toSignalCandle(dlCandle({ open_time_ms: -1 })).rejected).toBe('invalid-timestamp');
  });

  it('series conversion reports rejects instead of hiding them', () => {
    const r = toSignalCandles([dlCandle(), dlCandle({ volume: -5 }), dlCandle({ open_time_ms: 120_000 })]);
    expect(r.candles).toHaveLength(2);
    expect(r.rejected).toEqual([{ index: 1, reason: 'negative-volume' }]);
  });

  it('bridges real reconstructed candles from deterministic trades', () => {
    const trades: Trade[] = [
      { symbol: 'KRW-BTC', event_time_ms: 60_000, price: 100, volume: 1, side: 'bid', seq: 1 },
      { symbol: 'KRW-BTC', event_time_ms: 90_000, price: 110, volume: 2, side: 'bid', seq: 2 },
      { symbol: 'KRW-BTC', event_time_ms: 119_000, price: 105, volume: 1, side: 'ask', seq: 3 },
    ];
    const dl = reconstructCandles('KRW-BTC', trades, '1m', 180_000);
    expect(dl).toHaveLength(1); // window [60_000,120_000) is closed at asOf 180_000
    const bridged = toSignalCandles(dl);
    expect(bridged.rejected).toHaveLength(0);
    const c = bridged.candles[0]!;
    expect(c.open).toBe(100);
    expect(c.high).toBe(110);
    expect(c.low).toBe(100);
    expect(c.close).toBe(105);
    expect(c.volume).toBe(4);
    expect(c.time_ms).toBe(60_000);
  });
});
