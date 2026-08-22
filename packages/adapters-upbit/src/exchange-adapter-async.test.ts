import { describe, it, expect, vi } from 'vitest';
import { UpbitExchangeAdapter } from './exchange-adapter.js';
import type { Order } from '@genesis/production-engine';
import type { UpbitRestClient } from './rest.js';

// Fake RestClient — privatePost NEVER hits the network. No real Upbit order is ever placed.
function fakeRest(impl?: (path: string, params: Record<string, string | number>) => unknown) {
  const privatePost = vi.fn(async (path: string, params: Record<string, string | number>) =>
    impl ? impl(path, params) : { uuid: 'srv-1', state: 'wait' },
  );
  return { privatePost } as unknown as UpbitRestClient & { privatePost: ReturnType<typeof vi.fn> };
}

const BUY: Order = { client_order_id: 'c1', symbol: 'KRW-BTC', side: 'buy', notional: 10_000 };
const SELL: Order = { client_order_id: 'c2', symbol: 'KRW-BTC', side: 'sell', notional: 0.001 };

describe('I4-4: UpbitExchangeAdapter.submitOrder (async boundary, no real orders)', () => {
  it('maps buy → bid/price with identifier; returns ACKNOWLEDGED submission (not a fill)', async () => {
    const rest = fakeRest();
    const adapter = new UpbitExchangeAdapter(rest, false, () => 1000);
    const res = await adapter.submitOrder(BUY);
    expect(rest.privatePost).toHaveBeenCalledTimes(1);
    const [path, params] = rest.privatePost.mock.calls[0]!;
    expect(path).toBe('/v1/orders');
    expect(params).toMatchObject({ market: 'KRW-BTC', side: 'bid', ord_type: 'price', identifier: 'c1', price: 10_000 });
    expect(res.status).toBe('ACKNOWLEDGED');
    expect(res.exchange_order_id).toBe('srv-1');
    expect(res.submitted_at_ms).toBe(1000);
    expect(res).not.toHaveProperty('filled_notional'); // submission, not fill
  });

  it('maps sell → ask/market with volume', async () => {
    const rest = fakeRest();
    await new UpbitExchangeAdapter(rest).submitOrder(SELL);
    const params = rest.privatePost.mock.calls[0]![1];
    expect(params).toMatchObject({ side: 'ask', ord_type: 'market', identifier: 'c2', volume: 0.001 });
  });

  it('identifier propagates as client_order_id (idempotency at exchange level)', async () => {
    const rest = fakeRest();
    await new UpbitExchangeAdapter(rest).submitOrder(BUY);
    expect(rest.privatePost.mock.calls[0]![1]).toHaveProperty('identifier', 'c1');
  });

  it('maps Upbit state → OrderStatus (done→FILLED, cancel→CANCELLED)', async () => {
    const done = new UpbitExchangeAdapter(fakeRest(() => ({ uuid: 'u', state: 'done' })));
    expect((await done.submitOrder(BUY)).status).toBe('FILLED');
    const cancel = new UpbitExchangeAdapter(fakeRest(() => ({ uuid: 'u', state: 'cancel' })));
    expect((await cancel.submitOrder(BUY)).status).toBe('CANCELLED');
  });

  it('API error → REJECTED (fail-closed, no throw)', async () => {
    const rest = fakeRest(() => { throw new Error('Upbit POST /v1/orders 401'); });
    const res = await new UpbitExchangeAdapter(rest).submitOrder(BUY);
    expect(res.status).toBe('REJECTED');
    expect(res.reason).toContain('401');
  });

  it('dry-run → NO REST call, ACKNOWLEDGED with dry-run reason', async () => {
    const rest = fakeRest();
    const res = await new UpbitExchangeAdapter(rest, true).submitOrder(BUY);
    expect(rest.privatePost).not.toHaveBeenCalled(); // no order sent
    expect(res.status).toBe('ACKNOWLEDGED');
    expect(res.exchange_order_id).toBeNull();
    expect(res.reason).toContain('dry-run');
  });

  it('dry-run placeOrder (sync) → no REST call either', () => {
    const rest = fakeRest();
    const fill = new UpbitExchangeAdapter(rest, true).placeOrder(BUY);
    expect(rest.privatePost).not.toHaveBeenCalled();
    expect(fill.filled_notional).toBe(0); // ack, 0 filled
  });
});
