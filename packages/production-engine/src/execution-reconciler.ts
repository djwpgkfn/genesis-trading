import type { FillEvent, ReconciliationResult, OrderStatus } from './execution-contract.js';

/**
 * I4-3 Execution Reconciliation (production-engine).
 *
 * Reconciles the ACTUAL filled result of an order against what was REQUESTED, and drives the Risk
 * reservation lifecycle accordingly. Deliberately NOT the same value: requested_notional and
 * filled_notional are tracked separately (I4-1 accounting principle).
 *
 * Risk connection (existing RiskEngine public API — unchanged):
 *   - confirmFill(reservation_id): reserved → consumed   (called once, only if something filled)
 *   - release(reservation_id):     reservation back to available (called for the unfilled remainder,
 *                                   or for a fully unfilled/rejected order)
 *
 * Idempotency: each order (by client_order_id) is reconciled AT MOST ONCE. A duplicate reconcile
 * call is a no-op that returns the prior result — so Risk is never double-consumed or double-released.
 * (RiskBudget itself also guards against double consume/release, but the reconciler must not rely on
 * that alone — it refuses to re-drive a settled order.)
 *
 * This stage performs NO exchange I/O and NO private-WS wiring. Fills are provided by the caller as
 * FillEvent[] (later stages will source them from myOrder WS / REST). Exchange reconciliation adapter
 * is left to a follow-up stage.
 */

/** Minimal Risk surface the reconciler needs — matches RiskEngine.confirmFill/release exactly. */
export interface RiskReconcilePort {
  confirmFill(reservation_id: string): boolean;
  release(reservation_id: string): boolean;
}

/** The request side of a reconciliation: what Risk approved and what we asked the exchange for. */
export interface ReconcileRequest {
  readonly request_id: string;
  readonly client_order_id: string;
  readonly reservation_id: string;
  readonly requested_notional: number;
}

/** Outcome of driving Risk for one order (in addition to the ReconciliationResult snapshot). */
export interface ReconcileOutcome {
  readonly result: ReconciliationResult;
  readonly risk_confirmed: boolean; // confirmFill was called and succeeded (something filled)
  readonly risk_released: boolean; // release was called and succeeded (unfilled remainder/none)
  readonly duplicate: boolean; // this order was already reconciled — no-op replay
}

/** Derive a terminal order status from requested vs filled (rejected passed in explicitly). */
function deriveStatus(requested: number, filled: number, rejected: boolean): OrderStatus {
  if (rejected) return 'REJECTED';
  if (filled <= 0) return 'CANCELLED'; // nothing filled — treated as cancelled/unfilled
  if (filled + 1e-9 >= requested) return 'FILLED';
  return 'PARTIALLY_FILLED';
}

export class ExecutionReconciler {
  // client_order_id -> settled outcome (idempotency: reconcile at most once per order)
  private readonly settled = new Map<string, ReconcileOutcome>();

  constructor(private readonly risk: RiskReconcilePort) {}

  /** Whether this order has already been reconciled. */
  isSettled(client_order_id: string): boolean {
    return this.settled.has(client_order_id);
  }

  /**
   * Reconcile one order against its observed fills and drive Risk.
   * - fills: zero or more FillEvents observed for this order (partial fills accrue).
   * - rejected: true if the exchange rejected/failed the order (no fills, release the reservation).
   *
   * Rules:
   *   filled = Σ fills.filled_notional (never assumed equal to requested)
   *   if filled > 0  → confirmFill(reservation)   (consume the reserved budget for the fill)
   *   if remainder>0 → release(reservation)        (return the unfilled remainder)
   *   if filled == 0 → release(reservation)        (nothing consumed)
   * Idempotent: a second call for the same client_order_id returns the first outcome unchanged.
   */
  reconcile(req: ReconcileRequest, fills: readonly FillEvent[], rejected = false): ReconcileOutcome {
    const prior = this.settled.get(req.client_order_id);
    if (prior) return { ...prior, duplicate: true }; // no double consume/release

    const own = fills.filter((f) => f.client_order_id === req.client_order_id);
    const filled_notional = own.reduce((s, f) => s + f.filled_notional, 0);
    const fee_total = own.reduce((s, f) => s + f.fee, 0);
    const remaining_notional = Math.max(0, req.requested_notional - filled_notional);
    const final_status = deriveStatus(req.requested_notional, filled_notional, rejected);
    const exchange_order_id = own.find((f) => f.exchange_order_id != null)?.exchange_order_id ?? null;

    // Drive Risk. confirmFill consumes the reservation (reserved→consumed) when anything filled;
    // release returns the reservation for the unfilled remainder (or the whole thing if none filled).
    let risk_confirmed = false;
    let risk_released = false;
    if (!rejected && filled_notional > 0) {
      risk_confirmed = this.risk.confirmFill(req.reservation_id);
      // After consuming, a leftover remainder means the order won't fill further — release it.
      if (remaining_notional > 0) risk_released = this.risk.release(req.reservation_id);
    } else {
      // Nothing filled (unfilled / rejected / cancelled) — release the whole reservation.
      risk_released = this.risk.release(req.reservation_id);
    }

    const result: ReconciliationResult = {
      request_id: req.request_id,
      client_order_id: req.client_order_id,
      exchange_order_id,
      requested_notional: req.requested_notional,
      filled_notional,
      remaining_notional,
      fill_count: own.length,
      fee_total,
      final_status,
    };
    const outcome: ReconcileOutcome = { result, risk_confirmed, risk_released, duplicate: false };
    this.settled.set(req.client_order_id, outcome);
    return outcome;
  }
}
