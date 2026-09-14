import { describe, it, expect } from 'vitest';
import { PaperPortfolio } from './portfolio.js';

describe('I4-7B-2: PaperPortfolio (paper authoritative state)', () => {
  it('new position from a fill', () => {
    const p = new PaperPortfolio();
    p.applyFill('KRW-BTC', 'buy', 100_000, 1, 50);
    const pos = p.position('KRW-BTC')!;
    expect(pos.qty).toBe(1);
    expect(pos.notional).toBe(100_000);
    expect(pos.avg_price).toBe(100_000);
    expect(p.totalFees()).toBe(50);
  });

  it('additional buy updates the average price', () => {
    const p = new PaperPortfolio();
    p.applyFill('KRW-BTC', 'buy', 100_000, 1); // @100,000
    p.applyFill('KRW-BTC', 'buy', 60_000, 1); // @60,000
    const pos = p.position('KRW-BTC')!;
    expect(pos.qty).toBe(2);
    expect(pos.notional).toBe(160_000);
    expect(pos.avg_price).toBe(80_000);
  });

  it('partial fills accumulate', () => {
    const p = new PaperPortfolio();
    p.applyFill('KRW-BTC', 'buy', 60_000, 0.6);
    p.applyFill('KRW-BTC', 'buy', 20_000, 0.2);
    const pos = p.position('KRW-BTC')!;
    expect(pos.notional).toBe(80_000);
    expect(pos.qty).toBeCloseTo(0.8, 10);
  });

  it('sell reduces at average cost; full sell goes flat', () => {
    const p = new PaperPortfolio();
    p.applyFill('KRW-BTC', 'buy', 100_000, 1);
    p.applyFill('KRW-BTC', 'sell', 50_000, 0.5);
    expect(p.position('KRW-BTC')!.qty).toBeCloseTo(0.5, 10);
    expect(p.position('KRW-BTC')!.notional).toBeCloseTo(50_000, 6);
    p.applyFill('KRW-BTC', 'sell', 50_000, 0.5);
    expect(p.position('KRW-BTC')).toBeNull();
  });

  it('ignores zero/negative fills', () => {
    const p = new PaperPortfolio();
    p.applyFill('KRW-BTC', 'buy', 0, 0);
    expect(p.position('KRW-BTC')).toBeNull();
  });

  it('totalNotional sums open positions; asRiskPositions is risk-shaped', () => {
    const p = new PaperPortfolio();
    p.applyFill('KRW-BTC', 'buy', 100_000, 1);
    p.applyFill('KRW-ETH', 'buy', 50_000, 10);
    expect(p.totalNotional()).toBe(150_000);
    const rp = p.asRiskPositions();
    expect(rp).toHaveLength(2);
    expect(rp[0]).toEqual({ symbol: 'KRW-BTC', qty: 1, notional: 100_000 });
  });
});
