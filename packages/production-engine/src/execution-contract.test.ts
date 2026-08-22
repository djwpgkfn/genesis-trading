import { describe, it, expect } from 'vitest';
import type {
  ExecutionRequest,
  AsyncExchangeAdapter,
  SubmissionResult,
  FillEvent,
  ReconciliationResult,
  OrderStatus,
} from './execution-contract.js';
import type { Order } from './execution-gateway.js';

describe('I4-1: Execution Layer contracts (types only, no behavior)', () => {
  it('ExecutionRequest carries Risk approval handles + requested (never filled)', () => {
    const req: ExecutionRequest = {
      request_id: 'r1',
      client_order_id: 'c1',
      symbol: 'KRW-BTC',
      side: 'buy',
      requested_notional: 100_000,
      token_id: 'tok',
      reservation_id: 'res',
      correlation_id: 'corr',
      timestamp_ms: 1,
    };
    expect(req.requested_notional).toBe(100_000);
    expect(req.token_id).toBe('tok'); // no order without a token (INV-R1, enforced later)
  });

  it('AsyncExchangeAdapter.submitOrder returns an acknowledgment, not a fill', async () => {
    // A pure in-memory fake — NO real exchange call. Submission = accepted, filled stays separate.
    const fake: AsyncExchangeAdapter = {
      async submitOrder(o: Order): Promise<SubmissionResult> {
        return {
          client_order_id: o.client_order_id,
          exchange_order_id: 'x1',
          status: 'ACKNOWLEDGED',
          submitted_at_ms: 0,
          reason: 'accepted',
        };
      },
    };
    const ack = await fake.submitOrder({ client_order_id: 'c1', symbol: 'KRW-BTC', side: 'buy', notional: 100_000 });
    expect(ack.status).toBe('ACKNOWLEDGED');
    expect(ack).not.toHaveProperty('filled_notional'); // submission is not a fill
  });

  it('FillEvent accrues independently; requested != filled by construction', () => {
    const requested = 100_000;
    const fills: FillEvent[] = [
      { client_order_id: 'c1', exchange_order_id: 'x1', fill_seq: 1, filled_notional: 50_000, filled_qty: 0.5, price: 100_000, fee: 25, observed_at_ms: 1 },
      { client_order_id: 'c1', exchange_order_id: 'x1', fill_seq: 2, filled_notional: 30_000, filled_qty: 0.3, price: 100_000, fee: 15, observed_at_ms: 2 },
    ];
    const filled = fills.reduce((s, f) => s + f.filled_notional, 0);
    expect(filled).toBe(80_000);
    expect(filled).not.toBe(requested); // partial: requested_notional !== filled_notional
  });

  it('ReconciliationResult keeps requested/filled/remaining strictly separate', () => {
    const recon: ReconciliationResult = {
      request_id: 'r1',
      client_order_id: 'c1',
      exchange_order_id: 'x1',
      requested_notional: 100_000,
      filled_notional: 80_000,
      remaining_notional: 20_000,
      fill_count: 2,
      fee_total: 40,
      final_status: 'PARTIALLY_FILLED',
    };
    expect(recon.requested_notional - recon.filled_notional).toBe(recon.remaining_notional);
    expect(recon.remaining_notional).toBeGreaterThanOrEqual(0);
  });

  it('OrderStatus covers the reconciliation state machine domain', () => {
    const states: OrderStatus[] = ['SUBMITTED', 'ACKNOWLEDGED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'UNKNOWN'];
    expect(states).toHaveLength(7);
  });
});
