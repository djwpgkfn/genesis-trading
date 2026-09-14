import { describe, it, expect } from 'vitest';
import { RiskEngine } from '@genesis/risk-engine';
import { ExecutionReconciler, type ReconcileRequest } from './execution-reconciler.js';
import type { FillEvent } from './execution-contract.js';

// Integration: reconciler drives the REAL RiskEngine.confirmFill/release against its budget.
const limits = { maxTotalExposure: 1_000_000, maxSymbolExposure: 1_000_000, maxDrawdownPct: 0.5, trailingPct: 0.5 };
const eq = { peak: 1_000_000, current: 1_000_000 };

function fill(coid: string, n: number): FillEvent {
  return { client_order_id: coid, exchange_order_id: 'x', fill_seq: 1, filled_notional: n, filled_qty: 1, price: n, fee: 0, observed_at_ms: 1 };
}

function runningRisk(): RiskEngine {
  const risk = new RiskEngine({ total_budget: 1_000_000, limits });
  risk.init();
  risk.start();
  return risk;
}

describe('I4-3: reconciler ↔ real RiskEngine budget lifecycle', () => {
  it('partial fill keeps the reservation consumed — filled risk is NOT erased from the budget', () => {
    const risk = runningRisk();
    const d = risk.preTradeCheck({ request_id: 'r1', symbol: 'KRW-BTC', side: 'buy', notional: 100_000 }, [], eq);
    expect(d.approved).toBe(true);
    const req: ReconcileRequest = { request_id: 'r1', client_order_id: 'c1', reservation_id: d.reservation_id!, requested_notional: 100_000 };
    const rec = new ExecutionReconciler(risk);
    const o = rec.reconcile(req, [fill('c1', 60_000)]);
    expect(o.result.final_status).toBe('PARTIALLY_FILLED');
    expect(o.risk_confirmed).toBe(true);
    expect(o.risk_released).toBe(false); // conservative interim model

    // Budget snapshot: the whole reservation stays consumed (over-reserves vs the 60k actually
    // filled) rather than returning to available, which would under-count live risk.
    const snap = risk.budgetSnapshot();
    expect(snap.consumed).toBe(100_000);
    expect(snap.reserved).toBe(0);
    expect(snap.available).toBe(900_000);
    expect(snap.reserved + snap.consumed).toBeLessThanOrEqual(snap.total);

    // Duplicate must not perturb the budget again.
    const dup = rec.reconcile(req, [fill('c1', 60_000)]);
    expect(dup.duplicate).toBe(true);
    expect(risk.budgetSnapshot().consumed).toBe(100_000);
  });

  it('full fill consumes the reservation; budget reflects it', () => {
    const risk = runningRisk();
    const d = risk.preTradeCheck({ request_id: 'r2', symbol: 'KRW-BTC', side: 'buy', notional: 100_000 }, [], eq);
    const req: ReconcileRequest = { request_id: 'r2', client_order_id: 'c2', reservation_id: d.reservation_id!, requested_notional: 100_000 };
    new ExecutionReconciler(risk).reconcile(req, [fill('c2', 100_000)]);
    const snap = risk.budgetSnapshot();
    expect(snap.consumed).toBe(100_000);
    expect(snap.available).toBe(900_000);
  });

  it('unfilled order releases the reservation back to available', () => {
    const risk = runningRisk();
    const d = risk.preTradeCheck({ request_id: 'r3', symbol: 'KRW-BTC', side: 'buy', notional: 100_000 }, [], eq);
    const req: ReconcileRequest = { request_id: 'r3', client_order_id: 'c3', reservation_id: d.reservation_id!, requested_notional: 100_000 };
    const o = new ExecutionReconciler(risk).reconcile(req, []);
    expect(o.result.final_status).toBe('CANCELLED');
    expect(o.risk_released).toBe(true);
    const snap = risk.budgetSnapshot();
    expect(snap.consumed).toBe(0);
    expect(snap.reserved).toBe(0);
    expect(snap.available).toBe(1_000_000); // fully restored
  });

  it('rejected order releases the reservation back to available', () => {
    const risk = runningRisk();
    const d = risk.preTradeCheck({ request_id: 'r4', symbol: 'KRW-BTC', side: 'buy', notional: 100_000 }, [], eq);
    const req: ReconcileRequest = { request_id: 'r4', client_order_id: 'c4', reservation_id: d.reservation_id!, requested_notional: 100_000 };
    const o = new ExecutionReconciler(risk).reconcile(req, [], true);
    expect(o.result.final_status).toBe('REJECTED');
    expect(o.risk_released).toBe(true);
    expect(risk.budgetSnapshot().available).toBe(1_000_000);
  });

  it('multiple fills accrue to the requested total (40 + 20 = 60, partial)', () => {
    const risk = runningRisk();
    const d = risk.preTradeCheck({ request_id: 'r5', symbol: 'KRW-BTC', side: 'buy', notional: 100_000 }, [], eq);
    const req: ReconcileRequest = { request_id: 'r5', client_order_id: 'c5', reservation_id: d.reservation_id!, requested_notional: 100_000 };
    const f1 = fill('c5', 40_000);
    const f2 = { ...fill('c5', 20_000), fill_seq: 2 };
    const o = new ExecutionReconciler(risk).reconcile(req, [f1, f2]);
    expect(o.result.filled_notional).toBe(60_000);
    expect(o.result.remaining_notional).toBe(40_000);
    expect(o.result.final_status).toBe('PARTIALLY_FILLED');
  });
});
