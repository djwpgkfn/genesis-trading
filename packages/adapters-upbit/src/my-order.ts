import type { FillEvent } from '@genesis/production-engine';

/**
 * I4-5 Upbit myOrder normalization (adapters-upbit).
 *
 * Normalizes real Upbit private `myOrder` WebSocket messages (and REST /v1/order fallback rows,
 * which share the same field names) into the Genesis `FillEvent` contract (I4-1), then buffers them
 * per order with dedupe so the ExecutionReconciler consumes a clean, de-duplicated fill list.
 *
 * Real Upbit myOrder payload (from Upbit docs) — the fields we rely on:
 *   uuid            : exchange order id
 *   identifier      : our client_order_id (idempotency at order level)
 *   trade_uuid      : per-execution id — the natural dedupe key (Upbit has NO fill sequence number)
 *   state           : 'wait' | 'watch' | 'trade' | 'done' | 'cancel'
 *   executed_funds  : this message's filled notional (KRW)
 *   executed_volume : filled quantity
 *   avg_price       : average fill price
 *   paid_fee        : fee paid
 *   trades_count    : number of executions so far (fills FillEvent.fill_seq, which is numeric)
 *   trade_timestamp : execution time (ms)
 *
 * NO fabricated fields: dedupe uses the real `trade_uuid`; there is no invented sequence number.
 */

/** Shape of the Upbit myOrder message (only the fields we read). All optional — messages vary. */
export interface UpbitMyOrderMessage {
  type?: string;
  uuid?: string;
  identifier?: string;
  trade_uuid?: string;
  ask_bid?: string;
  state?: string;
  executed_funds?: number;
  executed_volume?: number;
  avg_price?: number;
  price?: number;
  paid_fee?: number;
  trades_count?: number;
  trade_timestamp?: number;
  timestamp?: number;
}

/** True for messages that represent an actual execution (a fill) we should turn into a FillEvent. */
function isExecution(m: UpbitMyOrderMessage): boolean {
  return !!m.trade_uuid && (m.executed_funds ?? 0) > 0;
}

/**
 * Normalize one myOrder message to a FillEvent, or null if it is not an execution (e.g. a pure
 * state change like accept/cancel with no fill). `client_order_id` prefers our `identifier`; if the
 * exchange omits it we fall back to the order `uuid` (still stable per order).
 */
export function parseMyOrder(m: UpbitMyOrderMessage): FillEvent | null {
  if (m.type && m.type !== 'myOrder') return null;
  if (!isExecution(m)) return null;
  const client_order_id = m.identifier ?? m.uuid ?? '';
  if (!client_order_id) return null;
  return {
    client_order_id,
    exchange_order_id: m.uuid ?? null,
    fill_seq: m.trades_count ?? 0, // numeric ordering hint; dedupe uses trade_uuid, not this
    filled_notional: m.executed_funds ?? 0,
    filled_qty: m.executed_volume ?? 0,
    price: m.avg_price ?? m.price ?? 0,
    fee: m.paid_fee ?? 0,
    observed_at_ms: m.trade_timestamp ?? m.timestamp ?? 0,
  };
}

/**
 * Per-order fill buffer with dedupe. Fills are keyed by the real `trade_uuid` so duplicates and
 * out-of-order redelivery (WS reconnect, REST fallback overlap) collapse to one. Accumulates fills
 * per client_order_id until the caller reconciles.
 */
export class MyOrderFillBuffer {
  // client_order_id -> (trade_uuid -> FillEvent)
  private readonly byOrder = new Map<string, Map<string, FillEvent>>();

  /**
   * Ingest a raw myOrder message. Returns the normalized FillEvent if it was a NEW execution, or
   * null if it was a non-execution message OR a duplicate trade_uuid (idempotent).
   */
  ingest(m: UpbitMyOrderMessage): FillEvent | null {
    const fill = parseMyOrder(m);
    if (!fill) return null;
    const tradeKey = m.trade_uuid!; // isExecution guaranteed it
    let map = this.byOrder.get(fill.client_order_id);
    if (!map) {
      map = new Map();
      this.byOrder.set(fill.client_order_id, map);
    }
    if (map.has(tradeKey)) return null; // duplicate execution — idempotent no-op
    map.set(tradeKey, fill);
    return fill;
  }

  /** All de-duplicated fills accrued for an order, ordered by fill_seq then observed time. */
  fills(client_order_id: string): FillEvent[] {
    const map = this.byOrder.get(client_order_id);
    if (!map) return [];
    return [...map.values()].sort((a, b) => a.fill_seq - b.fill_seq || a.observed_at_ms - b.observed_at_ms);
  }

  /** Sum of filled_notional for an order (never assumed equal to requested). */
  filledNotional(client_order_id: string): number {
    return this.fills(client_order_id).reduce((s, f) => s + f.filled_notional, 0);
  }

  /** Drop an order's buffer once it has been settled by the reconciler. */
  clear(client_order_id: string): void {
    this.byOrder.delete(client_order_id);
  }
}
