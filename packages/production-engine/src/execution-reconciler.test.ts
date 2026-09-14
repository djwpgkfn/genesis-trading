import { describe, it, expect, vi } from 'vitest';
import { ExecutionReconciler, type ReconcileRequest, type RiskReconcilePort } from './execution-reconciler.js';
import type { FillEvent } from './execution-contract.js';

function riskPort(): RiskReconcilePort & { confirmFill: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } {
  return { confirmFill: vi.fn(() => true), release: vi.fn(() => true) };
}
const REQ: ReconcileRequest = { request_id: 'r1', client_order_id: 'c1', reservation_id: 'res1', requested_notional: 100_000 };
function fill(n: number, seq = 1): FillEvent {
  return { client_order_id: 'c1', exchange_order_id: 'x1', fill_seq: seq, filled_notional: n, filled_qty: n / 100_000, price: 100_000, fee: n * 0.0005, observed_at_ms: seq };
}

describe('I4-3: Execution reconciliation', () => {
  it('requested == filled → FILLED, confirmFill only (no release)', () => {
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, [fill(100_000)]);
    expect(o.result.final_status).toBe('FILLED');
    expect(o.result.filled_notional).toBe(100_000);
    expect(o.result.remaining_notional).toBe(0);
    expect(risk.confirmFill).toHaveBeenCalledWith('res1');
    expect(risk.release).not.toHaveBeenCalled();
  });

  // I4-7A follow-up (conservative interim model): a partial fill KEEPS the reservation consumed.
  // release() would subtract the whole reservation from `consumed`, erasing the filled risk.
  it('requested > filled → PARTIALLY_FILLED, confirmFill only (remainder NOT released)', () => {
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, [fill(50_000, 1), fill(20_000, 2)]);
    expect(o.result.final_status).toBe('PARTIALLY_FILLED');
    expect(o.result.filled_notional).toBe(70_000);
    expect(o.result.remaining_notional).toBe(30_000);
    expect(o.result.fill_count).toBe(2);
    expect(risk.confirmFill).toHaveBeenCalledWith('res1');
    expect(risk.release).not.toHaveBeenCalled(); // conservative: filled risk stays in budget
    expect(o.risk_confirmed).toBe(true);
    expect(o.risk_released).toBe(false);
  });

  it('filled == 0 → CANCELLED, release only (nothing consumed)', () => {
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, []);
    expect(o.result.final_status).toBe('CANCELLED');
    expect(o.result.filled_notional).toBe(0);
    expect(risk.confirmFill).not.toHaveBeenCalled();
    expect(risk.release).toHaveBeenCalledWith('res1');
  });

  it('rejected → REJECTED, release only', () => {
    const risk = riskPort();
    const o = new ExecutionReconciler(risk).reconcile(REQ, [], true);
    expect(o.result.final_status).toBe('REJECTED');
    expect(risk.confirmFill).not.toHaveBeenCalled();
    expect(risk.release).toHaveBeenCalledWith('res1');
  });

  it('duplicate reconcile → no-op replay, NO double consume/release', () => {
    const risk = riskPort();
    const rec = new ExecutionReconciler(risk);
    const first = rec.reconcile(REQ, [fill(70_000)]);
    const second = rec.reconcile(REQ, [fill(70_000)]);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(risk.confirmFill).toHaveBeenCalledTimes(1); // not doubled
    expect(risk.release).not.toHaveBeenCalled(); // partial keeps the reservation consumed
    expect(rec.isSettled('c1')).toBe(true);
  });

  it('only counts fills belonging to this order (client_order_id filter)', () => {
    const risk = riskPort();
    const other: FillEvent = { ...fill(999_999), client_order_id: 'other' };
    const o = new ExecutionReconciler(risk).reconcile(REQ, [fill(40_000), other]);
    expect(o.result.filled_notional).toBe(40_000); // 'other' ignored
  });

  it('fee accrues across fills', () => {
    const o = new ExecutionReconciler(riskPort()).reconcile(REQ, [fill(50_000, 1), fill(50_000, 2)]);
    expect(o.result.fee_total).toBeCloseTo(50, 6); // 100_000 * 0.0005
    expect(o.result.final_status).toBe('FILLED');
  });
});
