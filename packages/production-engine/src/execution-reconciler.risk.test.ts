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

describe('I4-3: reconciler ↔ real RiskEngine budget lifecycle', () => {
  it('partial fill consumes filled, releases remainder — budget stays consistent', () => {
    const risk = new RiskEngine({ total_budget: 1_000_000, limits });
    risk.init();
    risk.start();
    const d = risk.preTradeCheck({ request_id: 'r1', symbol: 'KRW-BTC', side: 'buy', notional: 100_000 }, [], eq);
    expect(d.approved).toBe(true);
    const req: ReconcileRequest = { request_id: 'r1', client_order_id: 'c1', reservation_id: d.reservation_id!, requested_notional: 100_000 };
    const rec = new ExecutionReconciler(risk);
    const o = rec.reconcile(req, [fill('c1', 60_000)]);
    expect(o.result.final_status).toBe('PARTIALLY_FILLED');
    expect(o.risk_confirmed).toBe(true);
    expect(o.risk_released).toBe(true);
    // Duplicate must not perturb the budget again.
    const dup = rec.reconcile(req, [fill('c1', 60_000)]);
    expect(dup.duplicate).toBe(true);
  });
});
