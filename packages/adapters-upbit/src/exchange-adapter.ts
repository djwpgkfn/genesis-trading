import type {
  ExchangeAdapter,
  Order,
  Fill,
  AsyncExchangeAdapter,
  SubmissionResult,
  OrderStatus,
} from '@genesis/production-engine';
import { systemNowMs } from '@genesis/contracts';
import { UpbitRestClient } from './rest.js';

interface UpbitOrderResponse { uuid: string; executed_volume?: string; price?: string; state?: string }

/** Map Upbit order `state` to the Genesis OrderStatus domain (I4-1). Submission-time only. */
function mapUpbitState(state: string | undefined): OrderStatus {
  switch (state) {
    case 'wait':
    case 'watch':
      return 'ACKNOWLEDGED';
    case 'done':
      return 'FILLED';
    case 'cancel':
      return 'CANCELLED';
    default:
      return 'ACKNOWLEDGED'; // accepted ack; real fills reconciled later (I4-5)
  }
}

/**
 * Real Upbit Exchange Adapter — the single external order path (used ONLY behind the Execution
 * Gateway, which requires a Risk Approval Token). Implements both the legacy sync `ExchangeAdapter`
 * (S8) and the I4-2 `AsyncExchangeAdapter`. Submits a real order via /v1/orders. Upbit fills are
 * asynchronous, so submission returns an acknowledgment (NOT a fill); final fills are reconciled
 * from the private `myOrder`/`myTrade` WebSocket in a later stage (I4-5).
 *
 * NOTE: `placeOrder`/`submitOrder` perform a REAL trade unless `dryRun` is set. Tests inject a fake
 * RestClient so no real network call ever happens.
 */
export class UpbitExchangeAdapter implements ExchangeAdapter, AsyncExchangeAdapter {
  constructor(
    private readonly rest: UpbitRestClient,
    private readonly dryRun = false, // I4-4: when true, no REST call is made
    private readonly now: () => number = systemNowMs,
  ) {}

  placeOrder(order: Order): Fill {
    // The S8 ExchangeAdapter contract is sync; Upbit is async. We submit and return an
    // acknowledgment with 0 filled until the myOrder stream confirms. Callers reconcile via events.
    if (!this.dryRun) void this.submit(order);
    return { client_order_id: order.client_order_id, filled_notional: 0, price: 0 };
  }

  /**
   * I4-2 AsyncExchangeAdapter boundary. Submits to Upbit and returns a SubmissionResult
   * (acknowledgment — NOT a fill). On dry-run, no REST call is made. On error, returns REJECTED
   * (fail-closed) rather than throwing, so the gateway can settle deterministically.
   */
  async submitOrder(order: Order): Promise<SubmissionResult> {
    const submitted_at_ms = this.now();
    if (this.dryRun) {
      return {
        client_order_id: order.client_order_id,
        exchange_order_id: null,
        status: 'ACKNOWLEDGED',
        submitted_at_ms,
        reason: 'dry-run (no order sent)',
      };
    }
    try {
      const resp = await this.submit(order); // reuse existing real submission (REST/JWT/params)
      return {
        client_order_id: order.client_order_id,
        exchange_order_id: resp.uuid ?? null,
        status: mapUpbitState(resp.state),
        submitted_at_ms,
        reason: 'accepted',
      };
    } catch (e) {
      return {
        client_order_id: order.client_order_id,
        exchange_order_id: null,
        status: 'REJECTED' as OrderStatus,
        submitted_at_ms,
        reason: `rejected: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  /** Actual async submission to Upbit. side buy=bid/sell=ask; market-price buy uses ord_type=price. */
  async submit(order: Order): Promise<UpbitOrderResponse> {
    const side = order.side === 'buy' ? 'bid' : 'ask';
    const params: Record<string, string | number> = {
      market: order.symbol,
      side,
      ord_type: order.side === 'buy' ? 'price' : 'market',
      identifier: order.client_order_id, // idempotency at exchange level
    };
    if (order.side === 'buy') params['price'] = order.notional;      // KRW to spend
    else params['volume'] = order.notional;                          // qty to sell (mapped upstream)
    return this.rest.privatePost<UpbitOrderResponse>('/v1/orders', params);
  }
}
