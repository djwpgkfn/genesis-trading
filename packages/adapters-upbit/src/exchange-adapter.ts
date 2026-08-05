import type { ExchangeAdapter, Order, Fill } from '@genesis/production-engine';
import { UpbitRestClient } from './rest.js';

interface UpbitOrderResponse { uuid: string; executed_volume?: string; price?: string; state?: string }

/**
 * Real Upbit Exchange Adapter — the single external order path (used ONLY behind the S8 Execution
 * Gateway, which requires a Risk Approval Token). Submits a real order via /v1/orders. Upbit fills
 * are asynchronous, so this returns the accepted order; final fills are reconciled from the private
 * `myOrder`/`myTrade` WebSocket (feeds the event log; Risk consumes on confirmFill).
 *
 * NOTE: `placeOrder` performs a REAL trade. It runs only in a networked env with valid keys.
 */
export class UpbitExchangeAdapter implements ExchangeAdapter {
  constructor(private readonly rest: UpbitRestClient) {}

  placeOrder(order: Order): Fill {
    // The S8 ExchangeAdapter contract is sync; Upbit is async. We submit and return an
    // acknowledgment with 0 filled until the myOrder stream confirms. Callers reconcile via events.
    void this.submit(order);
    return { client_order_id: order.client_order_id, filled_notional: 0, price: 0 };
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
