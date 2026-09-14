import type { UpbitMyOrderMessage } from '@genesis/adapters-upbit';

/**
 * I4-7B-2 Simulated fill generator (paper).
 *
 * Turns an accepted simulated submission into myOrder-SHAPED messages, using the exact field names
 * Upbit sends (confirmed in I4-5). Those messages are fed into the EXISTING `MyOrderFillBuffer`, so
 * paper fills travel the same normalization + dedupe path as real fills — no second fill pipeline,
 * no invented idempotency key (dedupe stays on the real `trade_uuid`).
 *
 * No network, no credentials, no Upbit client: this module only builds plain objects.
 * Deterministic: trade_uuids and amounts derive from the order id and the requested plan.
 */

/** How the simulated venue fills an order. Deterministic — chosen by the caller, never random. */
export type FillPlan =
  | { kind: 'full' } // one fill for the whole requested notional
  | { kind: 'partial'; filled: number } // one fill for `filled` (< requested)
  | { kind: 'multi'; parts: readonly number[] } // several fills, in order
  | { kind: 'none' }; // no fills at all (e.g. cancelled)

export interface SimulatedFillInput {
  /** Our client order id — becomes myOrder `identifier`. */
  readonly client_order_id: string;
  /** Venue order id — becomes myOrder `uuid`. */
  readonly exchange_order_id: string;
  readonly requested_notional: number;
  /** Price used to derive executed_volume from executed_funds. */
  readonly price: number;
  /** Fee rate applied to each fill's funds (e.g. 0.0005). Default 0. */
  readonly feeRate?: number;
  /** Base timestamp (ms) for the generated fills; each fill increments by 1. */
  readonly at_ms?: number;
}

/** Build the myOrder-shaped messages for a plan. Returns [] for 'none'. */
export function generateFillMessages(input: SimulatedFillInput, plan: FillPlan): UpbitMyOrderMessage[] {
  const amounts = planAmounts(input.requested_notional, plan);
  const feeRate = input.feeRate ?? 0;
  const base = input.at_ms ?? 0;
  return amounts.map((funds, i) => ({
    type: 'myOrder',
    uuid: input.exchange_order_id,
    identifier: input.client_order_id,
    trade_uuid: `${input.exchange_order_id}-t${i + 1}`, // real dedupe key, deterministic
    ask_bid: 'BID',
    state: 'trade',
    executed_funds: funds,
    executed_volume: input.price > 0 ? funds / input.price : 0,
    avg_price: input.price,
    paid_fee: funds * feeRate,
    trades_count: i + 1,
    trade_timestamp: base + i + 1,
    timestamp: base + i + 1,
  }));
}

/** Resolve a plan into the per-fill funds amounts. */
function planAmounts(requested: number, plan: FillPlan): number[] {
  switch (plan.kind) {
    case 'full':
      return [requested];
    case 'partial':
      return plan.filled > 0 ? [Math.min(plan.filled, requested)] : [];
    case 'multi':
      return plan.parts.filter((p) => p > 0);
    case 'none':
      return [];
  }
}

/**
 * Re-emit a message to simulate duplicate delivery (WS redelivery / REST overlap). The buffer must
 * dedupe it by `trade_uuid` — this helper exists so tests can exercise that path without inventing
 * a new key.
 */
export function duplicateOf(msg: UpbitMyOrderMessage): UpbitMyOrderMessage {
  return { ...msg };
}
