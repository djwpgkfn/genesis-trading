import type { Position } from '@genesis/risk-engine';

/**
 * I4-7B-2 PaperPortfolio — the authoritative position state for PAPER runs only.
 *
 * Tracks what simulated fills actually produced: quantity, average price and notional per symbol.
 * The shape is deliberately compatible with the risk-engine `Position { symbol, qty, notional }`
 * so a later stage can feed it in, but this class is NOT wired into RiskEngine.preTradeCheck here.
 *
 * Wiring PaperPortfolio (or a production position engine) into Risk positions/equity and the
 * exposure axis is an explicit I5 task, together with the orchestrator RiskPort change and the
 * exact partial-fill budget accounting. This stage must not do it implicitly.
 */

export interface PaperPosition {
  readonly symbol: string;
  readonly qty: number;
  /** Cost basis: Σ filled funds (minus reductions), the value used for notional. */
  readonly notional: number;
  /** notional / qty (0 when flat). */
  readonly avg_price: number;
}

export class PaperPortfolio {
  private readonly bySymbol = new Map<string, { qty: number; notional: number }>();
  private fees = 0;

  /**
   * Apply one fill. `side` follows the TradeRequest side: 'buy' increases the position,
   * 'sell' reduces it. Average price is cost-basis based and recomputed on every buy.
   */
  applyFill(symbol: string, side: 'buy' | 'sell', filled_notional: number, filled_qty: number, fee = 0): void {
    if (filled_notional <= 0 || filled_qty <= 0) return;
    this.fees += fee;
    const cur = this.bySymbol.get(symbol) ?? { qty: 0, notional: 0 };
    if (side === 'buy') {
      this.bySymbol.set(symbol, { qty: cur.qty + filled_qty, notional: cur.notional + filled_notional });
      return;
    }
    // sell: reduce quantity at the current average cost; never go below zero.
    const soldQty = Math.min(filled_qty, cur.qty);
    const avg = cur.qty > 0 ? cur.notional / cur.qty : 0;
    const remainingQty = cur.qty - soldQty;
    const remainingNotional = Math.max(0, cur.notional - soldQty * avg);
    if (remainingQty <= 0) this.bySymbol.delete(symbol);
    else this.bySymbol.set(symbol, { qty: remainingQty, notional: remainingNotional });
  }

  /** Current position for a symbol (null when flat). */
  position(symbol: string): PaperPosition | null {
    const p = this.bySymbol.get(symbol);
    if (!p || p.qty <= 0) return null;
    return { symbol, qty: p.qty, notional: p.notional, avg_price: p.notional / p.qty };
  }

  /** All open positions. */
  positions(): PaperPosition[] {
    return [...this.bySymbol.entries()]
      .filter(([, p]) => p.qty > 0)
      .map(([symbol, p]) => ({ symbol, qty: p.qty, notional: p.notional, avg_price: p.notional / p.qty }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  /** Total cost basis across symbols — used as the paper `exposure` input to DecisionEngine. */
  totalNotional(): number {
    return this.positions().reduce((s, p) => s + p.notional, 0);
  }

  /** Accumulated simulated fees. */
  totalFees(): number {
    return this.fees;
  }

  /**
   * Risk-engine-shaped view. Provided for I5 wiring and for inspection; this stage does NOT pass it
   * to RiskEngine.preTradeCheck.
   */
  asRiskPositions(): Position[] {
    return this.positions().map((p) => ({ symbol: p.symbol, qty: p.qty, notional: p.notional }));
  }
}
