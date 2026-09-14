import type { Decision } from '@genesis/decision-engine';
import type { TradeRequest } from '@genesis/risk-engine';

/**
 * I4-7B-2 Decision → TradeRequest sizing bridge (paper).
 *
 * `Decision` is the Trading Core's SSOT and deliberately carries NO order size ("No orders are
 * created here"). Execution needs a `TradeRequest` with an absolute `notional`. This module is the
 * ONE explicit place where that conversion happens: every sizing constant lives in `SizingPolicy`,
 * so there are no magic numbers scattered through the pipeline.
 *
 * Determinism: the same Decision + market price + policy always yields the same TradeRequest.
 * No randomness, no clock, no hidden state.
 *
 * Scope: paper trading only. This is NOT a strategy — it does not change Decision semantics and it
 * does not touch the RiskEngine contract. Risk remains the final authority: whatever notional this
 * bridge proposes still has to pass preTradeCheck.
 */

/** All sizing constants in one place. */
export interface SizingPolicy {
  /** Notional used at confidence = 1.0 (currency units, e.g. KRW). */
  readonly baseNotional: number;
  /** Decisions below this confidence produce no order. */
  readonly minConfidence: number;
  /** Hard ceiling per order, independent of confidence. */
  readonly maxNotional: number;
  /** Orders below this notional are skipped (venue minimums / dust). */
  readonly minNotional: number;
}

export const DEFAULT_PAPER_SIZING: SizingPolicy = {
  baseNotional: 100_000,
  minConfidence: 0.1,
  maxNotional: 200_000,
  minNotional: 5_000,
};

/** What the bridge produced, including the quantity implied by the market price. */
export interface SizedOrder {
  readonly request: TradeRequest;
  /** quantity = requested_notional / market_price (the explicit notional↔quantity relation). */
  readonly quantity: number;
  readonly market_price: number;
}

/** Reason a Decision produced no order (explicit, not a silent null). */
export type SkipReason =
  | 'non-trading-action' // HOLD / WAIT
  | 'below-min-confidence'
  | 'below-min-notional'
  | 'invalid-price';

export type SizingResult = { sized: SizedOrder; skipped: null } | { sized: null; skipped: SkipReason };

/** Map a Decision action to a Risk side. Only BUY/SELL are executable. */
function sideFor(action: Decision['action']): 'buy' | 'sell' | null {
  if (action === 'BUY') return 'buy';
  if (action === 'SELL') return 'sell';
  return null; // HOLD / WAIT
}

/**
 * Convert one Decision into a TradeRequest using the market price.
 *
 * notional = clamp(baseNotional * confidence, .., maxNotional), rounded down to a whole unit so the
 * value is exactly reproducible; quantity = notional / market_price.
 * The `requested_notional` handed to Risk is exactly the value computed here — no later rescaling.
 */
export function sizeDecision(
  decision: Decision,
  market_price: number,
  policy: SizingPolicy = DEFAULT_PAPER_SIZING,
): SizingResult {
  const side = sideFor(decision.action);
  if (side === null) return { sized: null, skipped: 'non-trading-action' };
  if (decision.confidence < policy.minConfidence) return { sized: null, skipped: 'below-min-confidence' };
  if (!Number.isFinite(market_price) || market_price <= 0) return { sized: null, skipped: 'invalid-price' };

  const raw = policy.baseNotional * decision.confidence;
  const capped = Math.min(raw, policy.maxNotional);
  const notional = Math.floor(capped); // integer currency units → exactly reproducible
  if (notional < policy.minNotional) return { sized: null, skipped: 'below-min-notional' };

  const request: TradeRequest = {
    request_id: `paper-${decision.id}`,
    symbol: decision.symbol,
    side,
    notional,
  };
  return {
    sized: { request, quantity: notional / market_price, market_price },
    skipped: null,
  };
}

/** Last closed candle close price — the deterministic market price source for paper sizing. */
export function lastClose(candles: readonly { close: number }[]): number {
  return candles.length > 0 ? candles[candles.length - 1]!.close : 0;
}
