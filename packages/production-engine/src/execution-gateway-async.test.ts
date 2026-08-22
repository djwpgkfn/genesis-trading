import { describe, it, expect, vi } from 'vitest';
import { ExecutionGateway, type Order, type ExchangeAdapter, type KillSwitch } from './execution-gateway.js';
import type { AsyncExchangeAdapter, SubmissionResult } from './execution-contract.js';

const ORDER: Order = { client_order_id: 'c1', symbol: 'KRW-BTC', side: 'buy', notional: 100 };
const okToken = { authorizeExecution: (t: string) => t === 'good' };
const engaged: KillSwitch = { isEngaged: () => true };
const off: KillSwitch = { isEngaged: () => false };

function syncAdapter() {
  return { placeOrder: vi.fn((o: Order) => ({ client_order_id: o.client_order_id, filled_notional: o.notional, price: 1 })) };
}
function asyncAdapter(status: SubmissionResult['status'] = 'ACKNOWLEDGED') {
  return {
    submitOrder: vi.fn(async (o: Order): Promise<SubmissionResult> => ({
      client_order_id: o.client_order_id, exchange_order_id: 'x1', status, submitted_at_ms: 0, reason: status === 'REJECTED' ? 'rejected: test' : 'accepted',
    })),
  };
}

describe('I4-2: ExecutionGateway kill-switch + async boundary', () => {
  it('sync execute + kill OFF → adapter called (existing behavior preserved)', () => {
    const a = syncAdapter();
    const gw = new ExecutionGateway(okToken, a, 'c', 'snap1', undefined, undefined, off);
    const r = gw.execute(ORDER, 'good');
    expect(r.ok).toBe(true);
    expect(a.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('sync execute + kill ON → adapter NOT called (external submission blocked)', () => {
    const a = syncAdapter();
    const gw = new ExecutionGateway(okToken, a, 'c', 'snap1', undefined, undefined, engaged);
    const r = gw.execute(ORDER, 'good');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('kill-switch');
    expect(a.placeOrder).not.toHaveBeenCalled();
  });

  it('async executeAsync + kill OFF → async adapter called, returns submission (not a fill)', async () => {
    const a = asyncAdapter();
    const gw = new ExecutionGateway(okToken, syncAdapter(), 'c', 'snap1', undefined, undefined, off, a);
    const r = await gw.executeAsync(ORDER, 'good');
    expect(r.ok).toBe(true);
    expect(a.submitOrder).toHaveBeenCalledTimes(1);
    expect(r.submission?.status).toBe('ACKNOWLEDGED');
    expect(r).not.toHaveProperty('fill'); // submission, not fill
  });

  it('async executeAsync + kill ON → async adapter NOT called', async () => {
    const a = asyncAdapter();
    const gw = new ExecutionGateway(okToken, syncAdapter(), 'c', 'snap1', undefined, undefined, engaged, a);
    const r = await gw.executeAsync(ORDER, 'good');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('kill-switch');
    expect(a.submitOrder).not.toHaveBeenCalled();
  });

  it('async executeAsync without token → rejected, adapter NOT called (INV-R1 preserved)', async () => {
    const a = asyncAdapter();
    const gw = new ExecutionGateway(okToken, syncAdapter(), 'c', 'snap1', undefined, undefined, off, a);
    const r = await gw.executeAsync(ORDER, 'bad');
    expect(r.ok).toBe(false);
    expect(a.submitOrder).not.toHaveBeenCalled();
  });

  it('async adapter rejection/throw → fail-closed (ok:false), no crash', async () => {
    const a = { submitOrder: vi.fn(async () => { throw new Error('network'); }) };
    const gw = new ExecutionGateway(okToken, syncAdapter(), 'c', 'snap1', undefined, undefined, off, a);
    const r = await gw.executeAsync(ORDER, 'good');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('submit failed');
  });

  it('async adapter returns REJECTED status → ok:false (submission != acceptance)', async () => {
    const a = asyncAdapter('REJECTED');
    const gw = new ExecutionGateway(okToken, syncAdapter(), 'c', 'snap1', undefined, undefined, off, a);
    const r = await gw.executeAsync(ORDER, 'good');
    expect(r.ok).toBe(false);
    expect(a.submitOrder).toHaveBeenCalledTimes(1);
  });

  it('executeAsync with no async adapter configured → fail-closed', async () => {
    const gw = new ExecutionGateway(okToken, syncAdapter(), 'c', 'snap1', undefined, undefined, off);
    const r = await gw.executeAsync(ORDER, 'good');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('no async adapter');
  });
});
