import { describe, it, expect } from 'vitest';
import type { Position } from '@genesis/risk-engine';
import { createRiskProvider, createPortfolioProvider, type RiskSource } from './providers.js';

function riskSource(available: number, state: string): RiskSource {
  return { budgetSnapshot: () => ({ available }), state: () => state };
}
const positions: Position[] = [
  { symbol: 'KRW-BTC', qty: 1, notional: 300_000 },
  { symbol: 'KRW-ETH', qty: 2, notional: 200_000 },
];

describe('I2-1: Risk/Portfolio Provider Adapters', () => {
  it('RiskProvider maps budget available and halt state', () => {
    const p = createRiskProvider(riskSource(1_000_000, 'RUN'));
    expect(p(0)).toEqual({ budget_available: 1_000_000, halted: false });
  });
  it('RiskProvider reports halted for HALT/FROZEN', () => {
    expect(createRiskProvider(riskSource(0, 'HALT'))(0).halted).toBe(true);
    expect(createRiskProvider(riskSource(0, 'FROZEN'))(0).halted).toBe(true);
    expect(createRiskProvider(riskSource(5, 'SAFE_MODE'))(0).halted).toBe(false);
  });
  it('PortfolioProvider derives exposure from positions and cap from risk envelope', () => {
    const p = createPortfolioProvider(riskSource(1_000_000, 'RUN'), () => positions);
    expect(p(0)).toEqual({ exposure: 500_000, max_exposure: 1_000_000 });
  });
  it('is deterministic (same inputs ⇒ same snapshot)', () => {
    const r = createRiskProvider(riskSource(7, 'RUN'));
    expect(r(0)).toEqual(r(999));
    const pf = createPortfolioProvider(riskSource(10, 'RUN'), () => positions);
    expect(pf(0)).toEqual(pf(123));
  });
  it('Point-in-Time: positions provider receives asOf and result reflects only that input', () => {
    const seen: number[] = [];
    const pf = createPortfolioProvider(riskSource(10, 'RUN'), (asOf) => {
      seen.push(asOf);
      return asOf < 100 ? [] : positions;
    });
    expect(pf(50).exposure).toBe(0);
    expect(pf(150).exposure).toBe(500_000);
    expect(seen).toEqual([50, 150]);
  });
});
