import { describe, it, expect, vi } from 'vitest';
import { parseMyOrder, MyOrderFillBuffer, type UpbitMyOrderMessage } from './my-order.js';
import { ExecutionReconciler, type ReconcileRequest, type RiskReconcilePort } from '@genesis/production-engine';

// A real-shaped Upbit myOrder execution message.
function msg(over: Partial<UpbitMyOrderMessage> = {}): UpbitMyOrderMessage {
  return {
    type: 'myOrder',
    uuid: 'order-1',
    identifier: 'c1',
    trade_uuid: 't1',
    ask_bid: 'BID',
    state: 'trade',
    executed_funds: 50_000,
    executed_volume: 0.5,
    avg_price: 100_000,
    paid_fee: 25,
    trades_count: 1,
    trade_timestamp: 1000,
    ...over,
  };
}

// Helper: build a message with a given key removed (exactOptionalPropertyTypes forbids passing undefined).
function msgWithout(key: keyof UpbitMyOrderMessage, over: Partial<UpbitMyOrderMessage> = {}): UpbitMyOrderMessage {
  const m = msg(over);
  delete m[key];
  return m;
}

describe('I4-5: parseMyOrder normalization (real Upbit fields)', () => {
  it('normal fill → FillEvent with executed_funds as filled_notional, identifier as client_order_id', () => {
    const f = parseMyOrder(msg())!;
    expect(f.client_order_id).toBe('c1'); // identifier
    expect(f.exchange_order_id).toBe('order-1'); // uuid
    expect(f.filled_notional).toBe(50_000); // executed_funds, NOT requested
    expect(f.filled_qty).toBe(0.5);
    expect(f.price).toBe(100_000);
    expect(f.fee).toBe(25);
  });

  it('non-execution message (no trade_uuid / zero funds) → null', () => {
    expect(parseMyOrder(msgWithout('trade_uuid'))).toBeNull();
    expect(parseMyOrder(msg({ executed_funds: 0 }))).toBeNull();
  });

  it('non-myOrder type → null', () => {
    expect(parseMyOrder(msg({ type: 'ticker' }))).toBeNull();
  });

  it('falls back to uuid when identifier absent', () => {
    const f = parseMyOrder(msgWithout('identifier'))!;
    expect(f.client_order_id).toBe('order-1');
  });
});

describe('I4-5: MyOrderFillBuffer dedupe + accrual', () => {
  it('accrues partial fills for one order', () => {
    const buf = new MyOrderFillBuffer();
    buf.ingest(msg({ trade_uuid: 't1', executed_funds: 50_000, trades_count: 1 }));
    buf.ingest(msg({ trade_uuid: 't2', executed_funds: 30_000, trades_count: 2 }));
    expect(buf.fills('c1')).toHaveLength(2);
    expect(buf.filledNotional('c1')).toBe(80_000);
  });

  it('duplicate trade_uuid → idempotent no-op (dedupe)', () => {
    const buf = new MyOrderFillBuffer();
    expect(buf.ingest(msg({ trade_uuid: 't1' }))).not.toBeNull();
    expect(buf.ingest(msg({ trade_uuid: 't1' }))).toBeNull(); // duplicate
    expect(buf.fills('c1')).toHaveLength(1);
  });

  it('out-of-order events sort by fill_seq (trades_count)', () => {
    const buf = new MyOrderFillBuffer();
    buf.ingest(msg({ trade_uuid: 't2', trades_count: 2, executed_funds: 30_000 }));
    buf.ingest(msg({ trade_uuid: 't1', trades_count: 1, executed_funds: 50_000 }));
    const fills = buf.fills('c1');
    expect(fills[0]!.fill_seq).toBe(1);
    expect(fills[1]!.fill_seq).toBe(2);
  });

  it('WS reconnect redelivery (same trade_uuids) does not double-count', () => {
    const buf = new MyOrderFillBuffer();
    buf.ingest(msg({ trade_uuid: 't1', executed_funds: 50_000 }));
    buf.ingest(msg({ trade_uuid: 't2', executed_funds: 30_000 }));
    // reconnect: same two fills arrive again
    buf.ingest(msg({ trade_uuid: 't1', executed_funds: 50_000 }));
    buf.ingest(msg({ trade_uuid: 't2', executed_funds: 30_000 }));
    expect(buf.filledNotional('c1')).toBe(80_000); // not 160_000
  });

  it('REST fallback rows merge with WS fills by trade_uuid (no duplication)', () => {
    const buf = new MyOrderFillBuffer();
    buf.ingest(msg({ trade_uuid: 't1', executed_funds: 50_000 })); // from WS
    // REST fallback returns the same execution t1 plus a new one t2
    buf.ingest(msg({ trade_uuid: 't1', executed_funds: 50_000 })); // dup, ignored
    buf.ingest(msg({ trade_uuid: 't2', executed_funds: 20_000 })); // new
    expect(buf.filledNotional('c1')).toBe(70_000);
    expect(buf.fills('c1')).toHaveLength(2);
  });
});

describe('I4-5: buffer → ExecutionReconciler → Risk confirmFill/release', () => {
  function riskPort(): RiskReconcilePort & { confirmFill: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } {
    return { confirmFill: vi.fn(() => true), release: vi.fn(() => true) };
  }
  const REQ: ReconcileRequest = { request_id: 'r1', client_order_id: 'c1', reservation_id: 'res1', requested_notional: 100_000 };

  it('partial fills from buffer drive confirmFill + release remainder', () => {
    const buf = new MyOrderFillBuffer();
    buf.ingest(msg({ trade_uuid: 't1', executed_funds: 50_000, trades_count: 1 }));
    buf.ingest(msg({ trade_uuid: 't2', executed_funds: 20_000, trades_count: 2 }));
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, buf.fills('c1'));
    expect(o.result.final_status).toBe('PARTIALLY_FILLED');
    expect(o.result.filled_notional).toBe(70_000);
    expect(o.result.remaining_notional).toBe(30_000);
    expect(risk.confirmFill).toHaveBeenCalledWith('res1');
    expect(risk.release).toHaveBeenCalledWith('res1');
  });

  it('full fill from buffer → FILLED, confirmFill only', () => {
    const buf = new MyOrderFillBuffer();
    buf.ingest(msg({ trade_uuid: 't1', executed_funds: 100_000, trades_count: 1 }));
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, buf.fills('c1'));
    expect(o.result.final_status).toBe('FILLED');
    expect(risk.confirmFill).toHaveBeenCalledWith('res1');
    expect(risk.release).not.toHaveBeenCalled();
  });

  it('cancel with no fills → CANCELLED, release only', () => {
    const buf = new MyOrderFillBuffer();
    buf.ingest(msgWithout('trade_uuid', { state: 'cancel', executed_funds: 0 })); // non-execution
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, buf.fills('c1'));
    expect(o.result.final_status).toBe('CANCELLED');
    expect(risk.confirmFill).not.toHaveBeenCalled();
    expect(risk.release).toHaveBeenCalledWith('res1');
  });

  it('rejected → REJECTED, release only', () => {
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, [], true);
    expect(o.result.final_status).toBe('REJECTED');
    expect(risk.release).toHaveBeenCalledWith('res1');
  });
});
