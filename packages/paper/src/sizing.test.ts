import { describe, it, expect } from 'vitest';
import { sizeDecision, lastClose, DEFAULT_PAPER_SIZING, type SizingPolicy } from './sizing.js';
import type { Decision } from '@genesis/decision-engine';

function decision(over: Partial<Decision> = {}): Decision {
  return {
    id: 'decision-1000',
    symbol: 'KRW-BTC',
    action: 'BUY',
    confidence: 0.8,
    reason: 'test',
    strategy_used: 'trend-following',
    signal_used: ['TREND_UP'],
    expected_risk: 0.2,
    expected_reward: 0.5,
    timestamp_ms: 1000,
    trace: {
      action: 'BUY', strategy: 'trend-following', signals: ['TREND_UP'], features: ['slope=1'],
      confidence: 0.8, steps: [],
    },
    ...over,
  };
}

describe('I4-7B-2: Decision → TradeRequest sizing bridge', () => {
  it('BUY at confidence 0.8 → deterministic notional and quantity', () => {
    const r = sizeDecision(decision(), 100_000);
    expect(r.sized).not.toBeNull();
    const s = r.sized!;
    expect(s.request.notional).toBe(80_000); // 100_000 * 0.8
    expect(s.request.side).toBe('buy');
    expect(s.request.symbol).toBe('KRW-BTC');
    expect(s.request.request_id).toBe('paper-decision-1000');
    expect(s.quantity).toBeCloseTo(0.8, 10); // notional / price
    expect(s.market_price).toBe(100_000);
  });

  it('is deterministic: same decision + price → identical request', () => {
    const a = sizeDecision(decision(), 100_000).sized!;
    const b = sizeDecision(decision(), 100_000).sized!;
    expect(b.request).toEqual(a.request);
    expect(b.quantity).toBe(a.quantity);
  });

  it('SELL maps to side sell', () => {
    const s = sizeDecision(decision({ action: 'SELL' }), 50_000).sized!;
    expect(s.request.side).toBe('sell');
  });

  it('HOLD / WAIT produce no order', () => {
    expect(sizeDecision(decision({ action: 'HOLD' }), 100_000).skipped).toBe('non-trading-action');
    expect(sizeDecision(decision({ action: 'WAIT' }), 100_000).skipped).toBe('non-trading-action');
  });

  it('below minimum confidence → no order', () => {
    expect(sizeDecision(decision({ confidence: 0.05 }), 100_000).skipped).toBe('below-min-confidence');
  });

  it('notional below the venue minimum → no order', () => {
    const policy: SizingPolicy = { ...DEFAULT_PAPER_SIZING, baseNotional: 10_000, minNotional: 5_000 };
    expect(sizeDecision(decision({ confidence: 0.2 }), 100_000, policy).skipped).toBe('below-min-notional');
  });

  it('notional is capped by maxNotional', () => {
    const policy: SizingPolicy = { ...DEFAULT_PAPER_SIZING, baseNotional: 1_000_000, maxNotional: 200_000 };
    const s = sizeDecision(decision({ confidence: 1 }), 100_000, policy).sized!;
    expect(s.request.notional).toBe(200_000);
  });

  it('invalid market price → no order', () => {
    expect(sizeDecision(decision(), 0).skipped).toBe('invalid-price');
    expect(sizeDecision(decision(), Number.NaN).skipped).toBe('invalid-price');
  });

  it('lastClose picks the last closed candle', () => {
    expect(lastClose([{ close: 1 }, { close: 2 }, { close: 3 }])).toBe(3);
    expect(lastClose([])).toBe(0);
  });
});
