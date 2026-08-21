import { describe, it, expect } from 'vitest';
import { buildSampleRecording } from '@genesis/replay-engine';
import { frameView, type MarketView } from './frame-view.js';

const frame = buildSampleRecording(1)[0]!;                 // contract-complete frame (40 candles)
const emptyFrame = { ...frame, snapshot: { ...frame.snapshot, candles: [] } }; // same contract, no candles

describe('I2-4b: MarketView candle-derived fields', () => {
  it('last_close = last candle close; candle_count = candles length (deterministic)', () => {
    const m: MarketView = frameView(frame).market;
    const candles = frame.snapshot.candles;
    expect(m.candle_count).toBe(candles.length);
    expect(m.last_close).toBe(candles[candles.length - 1]!.close);
    expect(m.price).toBe(m.last_close); // consistent with existing price field
  });

  it('empty candles → last_close null, candle_count 0', () => {
    const m: MarketView = frameView(emptyFrame).market;
    expect(m.last_close).toBeNull();
    expect(m.candle_count).toBe(0);
    expect(m.price).toBeNull();
  });

  it('MarketView contract carries no microstructure fields (compile-time keys only)', () => {
    const m: MarketView = frameView(frame).market;
    // The set of MarketView keys is exactly the declared contract — no orderbook/trade/volume.
    expect(Object.keys(m).sort()).toEqual(
      ['candle_count', 'candle_time', 'last_close', 'price', 'symbol', 'timeframe'].sort(),
    );
  });
});
