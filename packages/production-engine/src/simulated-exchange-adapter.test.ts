import { describe, it, expect, vi } from 'vitest';
import { SimulatedExchangeAdapter } from './simulated-exchange-adapter.js';
import { ExecutionGateway, type Order } from './execution-gateway.js';
import type { AsyncExchangeAdapter } from './execution-contract.js';

const ORDER: Order = { client_order_id: 'c1', symbol: 'KRW-BTC', side: 'buy', notional: 100 };

describe('I4-7B-1: SimulatedExchangeAdapter (paper boundary, no network)', () => {
  it('accepts a submission → ACKNOWLEDGED, not a fill', async () => {
    const sim = new SimulatedExchangeAdapter({ now: () => 1000 });
    const res = await sim.submitOrder(ORDER);
    expect(res.status).toBe('ACKNOWLEDGED');
    expect(res.submitted_at_ms).toBe(1000);
    expect(res).not.toHaveProperty('filled_notional'); // submission ≠ fill
  });

  it('preserves client_order_id', async () => {
    const sim = new SimulatedExchangeAdapter();
    const res = await sim.submitOrder({ ...ORDER, client_order_id: 'abc-123' });
    expect(res.client_order_id).toBe('abc-123');
  });

  it('generates a deterministic exchange_order_id (same input → same id)', async () => {
    const a = await new SimulatedExchangeAdapter().submitOrder(ORDER);
    const b = await new SimulatedExchangeAdapter().submitOrder(ORDER);
    expect(a.exchange_order_id).toBe('sim-c1');
    expect(b.exchange_order_id).toBe(a.exchange_order_id);
    expect(new SimulatedExchangeAdapter().exchangeOrderIdFor('c9')).toBe('sim-c9');
  });

  it('needs no credentials and makes no network call (structurally)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation((() => {
      throw new Error('network must not be used');
    }) as never);
    const sim = new SimulatedExchangeAdapter(); // no keys, no rest client
    const res = await sim.submitOrder(ORDER);
    expect(res.status).toBe('ACKNOWLEDGED');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('configured rejection → REJECTED with no exchange order id', async () => {
    const sim = new SimulatedExchangeAdapter({ mode: 'reject' });
    const res = await sim.submitOrder(ORDER);
    expect(res.status).toBe('REJECTED');
    expect(res.exchange_order_id).toBeNull();
  });

  it('configured failure → throws deterministically (gateway must fail closed)', async () => {
    const sim = new SimulatedExchangeAdapter({ mode: 'throw' });
    await expect(sim.submitOrder(ORDER)).rejects.toThrow(/simulated exchange failure/);
  });

  it('real order count is always 0; submissions are counted', async () => {
    const sim = new SimulatedExchangeAdapter();
    await sim.submitOrder(ORDER);
    await sim.submitOrder({ ...ORDER, client_order_id: 'c2' });
    expect(sim.submissionCount()).toBe(2);
    expect(sim.realOrderCount()).toBe(0);
  });

  it('satisfies the AsyncExchangeAdapter contract and works behind ExecutionGateway', async () => {
    const sim: AsyncExchangeAdapter = new SimulatedExchangeAdapter({ now: () => 7 });
    const gw = new ExecutionGateway(
      { authorizeExecution: (t) => t === 'good' },
      { placeOrder: (o) => ({ client_order_id: o.client_order_id, filled_notional: 0, price: 0 }) },
      'paper-corr',
      'paper-snap',
      undefined,
      undefined,
      undefined,
      sim,
    );
    const r = await gw.executeAsync(ORDER, 'good');
    expect(r.ok).toBe(true);
    expect(r.submission?.status).toBe('ACKNOWLEDGED');
    expect(r.submission?.exchange_order_id).toBe('sim-c1');
  });

  it('gateway fails closed when the simulator throws', async () => {
    const sim = new SimulatedExchangeAdapter({ mode: 'throw' });
    const gw = new ExecutionGateway(
      { authorizeExecution: () => true },
      { placeOrder: (o) => ({ client_order_id: o.client_order_id, filled_notional: 0, price: 0 }) },
      'paper-corr',
      'paper-snap',
      undefined,
      undefined,
      undefined,
      sim,
    );
    const r = await gw.executeAsync(ORDER, 'good');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('submit failed');
  });
});
