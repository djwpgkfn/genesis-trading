import { describe, it, expect } from 'vitest';
import { RiskEngine } from './engine.js';
import { trailingStop, trailingExit } from './limits.js';
import type { Limits, Position, TradeRequest } from './types.js';

const limits: Limits = {
  maxTotalExposure: 1000,
  maxSymbolExposure: 600,
  maxDrawdownPct: 0.2,
  trailingPct: 0.1,
};
const eq = { peak: 100, current: 100 };
const req = (id: string, n = 100): TradeRequest => ({
  request_id: id,
  symbol: 'KRW-BTC',
  side: 'buy',
  notional: n,
});
const run = (total = 1000): RiskEngine => {
  const e = new RiskEngine({ total_budget: total, limits });
  e.init();
  e.start();
  return e;
};

describe('Risk Engine (final authority)', () => {
  it('no cold-start into RUN; INIT→READY→RUN only', () => {
    const e = new RiskEngine({ total_budget: 1000, limits });
    expect(() => e.start()).toThrow(); // INIT→RUN invalid
    e.init();
    expect(e.state()).toBe('READY');
    e.start();
    expect(e.state()).toBe('RUN');
  });

  it('issues single-use token; execution needs a valid token', () => {
    const e = run();
    const d = e.preTradeCheck(req('r1'), [], eq);
    expect(d.approved).toBe(true);
    expect(e.authorizeExecution(d.token_id!)).toBe(true);
    expect(e.authorizeExecution(d.token_id!)).toBe(false); // single-use
    expect(e.authorizeExecution('bogus')).toBe(false);
  });

  it('budget reserve→consume→release keeps reserved+consumed<=total', () => {
    const e = run(150);
    const a = e.preTradeCheck(req('a', 100), [], eq);
    expect(a.approved).toBe(true);
    expect(e.preTradeCheck(req('b', 100), [], eq).approved).toBe(false); // over budget
    e.confirmFill(a.reservation_id!);
    const s = e.budgetSnapshot();
    expect(s.consumed).toBe(100);
    expect(s.reserved + s.consumed).toBeLessThanOrEqual(s.total);
    e.release(a.reservation_id!);
    expect(e.budgetSnapshot().available).toBe(150);
  });

  it('HALT invalidates tokens and latches; recovery→READY→RUN', () => {
    const e = run();
    const d = e.preTradeCheck(req('r1'), [], eq);
    e.emergencyHalt('panic');
    expect(e.state()).toBe('HALT');
    expect(e.authorizeExecution(d.token_id!)).toBe(false); // invalidated
    expect(() => e.start()).toThrow(); // latching
    e.startRecovery(() => true);
    expect(e.state()).toBe('READY');
    e.start();
    expect(e.state()).toBe('RUN');
  });

  it('recovery failures escalate to FROZEN', () => {
    const e = run();
    e.emergencyHalt('x');
    e.startRecovery(() => false); // attempt1 → HALT
    e.startRecovery(() => false); // attempt2 → HALT
    e.startRecovery(() => false); // attempt3 → FROZEN
    expect(e.state()).toBe('FROZEN');
  });

  it('idempotent: same request_id not double-approved', () => {
    const e = run();
    const a = e.preTradeCheck(req('same'), [], eq);
    const b = e.preTradeCheck(req('same'), [], eq);
    expect(a.token_id).toBe(b.token_id);
    expect(e.budgetSnapshot().reserved).toBe(100);
  });

  it('reconcile mismatch → HALT', () => {
    const e = run();
    const sys: Position[] = [{ symbol: 'KRW-BTC', qty: 1, notional: 100 }];
    const exch: Position[] = [{ symbol: 'KRW-BTC', qty: 2, notional: 200 }];
    expect(e.reconcile(sys, exch)).toBe(false);
    expect(e.state()).toBe('HALT');
  });

  it('trailing stop math', () => {
    expect(trailingStop(100, 0.1)).toBe(90);
    expect(trailingExit(100, 89, 0.1)).toBe(true);
    expect(trailingExit(100, 95, 0.1)).toBe(false);
  });
});
