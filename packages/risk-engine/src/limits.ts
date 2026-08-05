import type { Limits, Position } from './types.js';

export function totalExposure(positions: readonly Position[]): number {
  return positions.reduce((a, p) => a + Math.abs(p.notional), 0);
}
export function symbolExposure(positions: readonly Position[], symbol: string): number {
  return positions.filter((p) => p.symbol === symbol).reduce((a, p) => a + Math.abs(p.notional), 0);
}

export interface ExposureCheck { ok: boolean; reason: string }
export function checkExposure(
  positions: readonly Position[],
  symbol: string,
  addNotional: number,
  limits: Limits,
): ExposureCheck {
  if (totalExposure(positions) + addNotional > limits.maxTotalExposure) {
    return { ok: false, reason: 'total exposure limit' };
  }
  if (symbolExposure(positions, symbol) + addNotional > limits.maxSymbolExposure) {
    return { ok: false, reason: 'symbol exposure limit' };
  }
  return { ok: true, reason: 'ok' };
}

/** Drawdown from peak equity. Returns fraction 0..1. */
export function drawdown(peakEquity: number, equity: number): number {
  if (peakEquity <= 0) return 0;
  return Math.max(0, (peakEquity - equity) / peakEquity);
}
export function drawdownBreached(peakEquity: number, equity: number, limits: Limits): boolean {
  return drawdown(peakEquity, equity) > limits.maxDrawdownPct;
}

/** Volatility-agnostic trailing stop: stop = highWater * (1 - trailingPct). Exit if price <= stop. */
export function trailingStop(highWater: number, trailingPct: number): number {
  return highWater * (1 - trailingPct);
}
export function trailingExit(highWater: number, price: number, trailingPct: number): boolean {
  return price <= trailingStop(highWater, trailingPct);
}
