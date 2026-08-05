import type { Allocation } from './types.js';

export interface OrderIntent {
  symbol: string;
  side: 'buy' | 'sell';
  notional: number;
}

/**
 * Target vs current → order intents (deltas). These are INTENTS only; every order must still
 * pass the Risk gate (S6) for an Approval Token. Portfolio never executes (never bypasses Risk).
 */
export function rebalance(
  current: Record<string, number>, // symbol → current notional
  target: readonly Allocation[],
  minTradeNotional = 0,
): OrderIntent[] {
  const out: OrderIntent[] = [];
  const symbols = new Set<string>([...Object.keys(current), ...target.map((t) => t.symbol)]);
  for (const sym of [...symbols].sort()) {
    const cur = current[sym] ?? 0;
    const tgt = target.find((t) => t.symbol === sym)?.notional ?? 0;
    const delta = tgt - cur;
    if (Math.abs(delta) <= minTradeNotional) continue;
    out.push({ symbol: sym, side: delta > 0 ? 'buy' : 'sell', notional: Math.abs(delta) });
  }
  return out;
}
