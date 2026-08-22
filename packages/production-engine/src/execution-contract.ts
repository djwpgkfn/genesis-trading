import type { Order, Fill } from './execution-gateway.js';

/**
 * I4-1 Execution Layer contracts (TYPES ONLY — no behavior, no exchange I/O).
 *
 * These are additive contracts that sit alongside the existing sync `ExchangeAdapter`/`Order`/`Fill`
 * (execution-gateway.ts). They exist to describe the async execution boundary, order submission,
 * asynchronous fills, and reconciliation — WITHOUT changing any existing behavior. No Upbit calls,
 * no WS, no reconciliation logic, no kill-switch, no invariants are implemented here (later stages).
 *
 * Accounting principle (enforced by later stages, encoded structurally here):
 *   requested_notional is NEVER treated as filled_notional. Fills accrue independently.
 */

/**
 * A thin execution request (Q1: thin, NOT a full target-position model).
 * Carries the Decision identity plus the Risk approval handles (token + reservation) so the
 * gateway can authorize and later reconcile. Mirrors fields already produced by RiskDecision
 * (risk-engine) without importing the domain type (presentation/execution boundary stays clean).
 */
export interface ExecutionRequest {
  readonly request_id: string; // = decision/request identity (matches TradeRequest.request_id)
  readonly client_order_id: string; // idempotency key at the gateway/exchange boundary
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly requested_notional: number; // requested exposure — NEVER conflated with filled
  readonly token_id: string; // Risk approval token (no order without it — INV-R1)
  readonly reservation_id: string; // Risk budget reservation (for confirmFill/release)
  readonly correlation_id: string;
  readonly timestamp_ms: number;
}

/** Terminal/lifecycle states of an order at the exchange (reconciliation state machine domain). */
export type OrderStatus =
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'UNKNOWN';

/**
 * Result of submitting an order to the exchange (acknowledgment — NOT a fill).
 * A successful submission means "accepted", not "filled". filled_* stays absent/zero here.
 */
export interface SubmissionResult {
  readonly client_order_id: string;
  readonly exchange_order_id: string | null; // null until the exchange assigns one
  readonly status: OrderStatus; // typically SUBMITTED | ACKNOWLEDGED | REJECTED
  readonly submitted_at_ms: number;
  readonly reason: string; // e.g. 'accepted', 'rejected: <cause>'
}

/**
 * Async exchange boundary (Q2: additive; existing sync `ExchangeAdapter.placeOrder` is untouched).
 * `submitOrder` submits and returns an acknowledgment; fills arrive separately (FillEvent) and are
 * reconciled — the method name deliberately avoids `placeOrder` to separate submit from fill.
 */
export interface AsyncExchangeAdapter {
  submitOrder(order: Order): Promise<SubmissionResult>;
}

/**
 * A single fill (or partial fill) observed from the exchange (primary source: private myOrder WS).
 * Independent from the request: many FillEvents may accrue against one client_order_id.
 */
export interface FillEvent {
  readonly client_order_id: string;
  readonly exchange_order_id: string | null;
  readonly fill_seq: number; // ordering/idempotency within one order (dedupe out-of-order)
  readonly filled_notional: number; // this event's fill — accrues, never equals requested by assumption
  readonly filled_qty: number;
  readonly price: number;
  readonly fee: number;
  readonly observed_at_ms: number;
}

/**
 * Reconciliation snapshot for one order: requested vs actually filled, kept strictly separate.
 * Later stages feed filled_notional into RiskEngine.confirmFill and remaining into release.
 */
export interface ReconciliationResult {
  readonly request_id: string;
  readonly client_order_id: string;
  readonly exchange_order_id: string | null;
  readonly requested_notional: number;
  readonly filled_notional: number; // Σ FillEvent.filled_notional
  readonly remaining_notional: number; // requested - filled (>= 0)
  readonly fill_count: number;
  readonly fee_total: number;
  readonly final_status: OrderStatus;
}

/** Structural relationship of the accounting fields to a Fill (kept for later reconciler wiring). */
export type FillLike = Pick<Fill, 'client_order_id' | 'filled_notional' | 'price'>;
