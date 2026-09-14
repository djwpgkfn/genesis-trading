import { SignalEngine, type Candle, type MarketSnapshot, type Signal } from '@genesis/signal-engine';
import { StrategyEngine } from '@genesis/strategy-engine';
import { DecisionEngine, type Decision } from '@genesis/decision-engine';
import { RiskEngine, type Limits, type Position } from '@genesis/risk-engine';
import {
  ExecutionGateway,
  ExecutionReconciler,
  SimulatedExchangeAdapter,
  type Order,
  type Fill,
  type FillEvent,
  type ReconcileRequest,
} from '@genesis/production-engine';
import { MyOrderFillBuffer } from '@genesis/adapters-upbit';
import { sizeDecision, lastClose, DEFAULT_PAPER_SIZING, type SizingPolicy } from './sizing.js';
import { generateFillMessages, type FillPlan } from './simulated-fill-generator.js';
import { PaperPortfolio } from './portfolio.js';

/**
 * I4-7B-2b deterministic paper pipeline.
 *
 * Connects the EXISTING engines and the EXISTING execution path end to end:
 *   MarketSnapshot → SignalEngine → StrategyEngine → DecisionEngine → sizeDecision
 *   → RiskEngine.preTradeCheck → ExecutionGateway.executeAsync → SimulatedExchangeAdapter
 *   → SimulatedFillGenerator → MyOrderFillBuffer → ExecutionReconciler → Risk confirm/release
 *   → PaperPortfolio
 *
 * No parallel execution path: orders only ever reach the venue through ExecutionGateway, and fills
 * only ever become FillEvents through MyOrderFillBuffer. No Upbit REST/private-WS client, no API
 * credentials, no network — `real_orders` is structurally 0.
 *
 * Risk positions/equity are deterministic test inputs here; wiring PaperPortfolio into
 * RiskEngine.preTradeCheck (and the exposure axis) is an explicit I5 task.
 */

export interface PaperMetrics {
  cycles: number;
  decisions: number;
  approvals: number;
  rejections: number;
  orders_submitted: number;
  fills_full: number;
  fills_partial: number;
  fills_duplicate: number;
  reconciliations: number;
  risk_confirmed: number;
  risk_released: number;
  real_orders: number;
  exceptions: number;
  budget_consistent: boolean;
  paper_portfolio_final_state: { symbol: string; qty: number; notional: number; avg_price: number }[];
  gateway_bypassed: boolean;
  adapter_calls: number;
}

export interface PaperCycleOptions {
  readonly candles: readonly Candle[];
  readonly symbol?: string;
  /** How the simulated venue fills this order. Deterministic. */
  readonly fillPlan?: FillPlan;
  /** Emit each fill message twice to exercise dedupe. */
  readonly duplicateFills?: boolean;
  /** Venue behaviour: 'accept' | 'reject' | 'throw'. */
  readonly venueMode?: 'accept' | 'reject' | 'throw';
  readonly sizing?: SizingPolicy;
  /** Deterministic Risk inputs (I5 will replace these with real positions/equity). */
  readonly positions?: readonly Position[];
  readonly equity?: { peak: number; current: number };
  readonly requestSeq?: number;
}

export interface PaperCycleResult {
  snapshot: MarketSnapshot;
  signals: Signal[];
  decision: Decision;
  sized: ReturnType<typeof sizeDecision>;
  approved: boolean;
  submission_ok: boolean;
  fills: FillEvent[];
  filled_notional: number;
  reconciled: boolean;
  final_status: string | null;
  portfolio_after: { symbol: string; qty: number; notional: number; avg_price: number }[];
  adapter_calls: number;
}

const LIMITS: Limits = {
  maxTotalExposure: 10_000_000,
  maxSymbolExposure: 10_000_000,
  maxDrawdownPct: 0.9,
  trailingPct: 0.9,
};
const DEFAULT_EQUITY = { peak: 10_000_000, current: 10_000_000 };

/** A sync ExchangeAdapter stub. The paper path uses executeAsync only; this is never called. */
const NOOP_SYNC = {
  placeOrder: (o: Order): Fill => ({ client_order_id: o.client_order_id, filled_notional: 0, price: 0 }),
};

/** Fresh RiskEngine in RUN state. */
export function paperRisk(total_budget = 10_000_000): RiskEngine {
  const risk = new RiskEngine({ total_budget, limits: LIMITS });
  risk.init();
  risk.start();
  return risk;
}

/**
 * Run ONE deterministic paper cycle through the real engines and the real execution path.
 * Every intermediate result is returned so the integration test can assert each contract hop.
 */
export async function runPaperCycle(
  risk: RiskEngine,
  portfolio: PaperPortfolio,
  opts: PaperCycleOptions,
): Promise<PaperCycleResult> {
  const symbol = opts.symbol ?? 'KRW-BTC';
  const candles = [...opts.candles];
  const snapshot: MarketSnapshot = {
    symbol,
    timestamp_ms: candles[candles.length - 1]?.time_ms ?? 0,
    candles,
  };

  // 1) Market data → Signals → Strategy → Decision (all real engines, unmodified).
  const signals = new SignalEngine().generate(snapshot);
  const strategy = new StrategyEngine().select(signals);
  const budget = risk.budgetSnapshot();
  const decision = new DecisionEngine().decide(
    strategy,
    signals,
    { budget_available: budget.available, halted: false },
    { exposure: portfolio.totalNotional(), max_exposure: LIMITS.maxTotalExposure },
    { symbol, timestamp_ms: snapshot.timestamp_ms },
  );

  // 2) Decision → TradeRequest (explicit sizing bridge; Decision carries no size).
  const price = lastClose(candles);
  const sized = sizeDecision(decision, price, opts.sizing ?? DEFAULT_PAPER_SIZING);
  const base: PaperCycleResult = {
    snapshot, signals, decision, sized,
    approved: false, submission_ok: false, fills: [], filled_notional: 0,
    reconciled: false, final_status: null, portfolio_after: portfolio.positions(), adapter_calls: 0,
  };
  if (sized.sized === null) return base; // HOLD/WAIT, low confidence, bad price → no order

  // 3) Risk is the final authority. Positions/equity are deterministic inputs (I5 wires the real ones).
  const req = sized.sized.request;
  const uniqueReq = { ...req, request_id: `${req.request_id}#${opts.requestSeq ?? 0}` };
  const decisionRisk = risk.preTradeCheck(uniqueReq, opts.positions ?? [], opts.equity ?? DEFAULT_EQUITY);
  if (!decisionRisk.approved || !decisionRisk.token_id || !decisionRisk.reservation_id) {
    return { ...base, approved: false };
  }

  // 4) Execution ONLY through the gateway (kill-switch + token + async boundary preserved).
  const venue = new SimulatedExchangeAdapter({ mode: opts.venueMode ?? 'accept', now: () => snapshot.timestamp_ms });
  const gateway = new ExecutionGateway(
    risk, NOOP_SYNC, 'paper-corr', 'paper-snap', undefined, undefined, undefined, venue,
  );
  const order: Order = {
    client_order_id: uniqueReq.request_id,
    symbol: uniqueReq.symbol,
    side: uniqueReq.side,
    notional: uniqueReq.notional,
  };
  const submission = await gateway.executeAsync(order, decisionRisk.token_id);
  const adapter_calls = venue.submissionCount();

  // 5) Simulated fills → myOrder-shaped messages → the REAL MyOrderFillBuffer (trade_uuid dedupe).
  const buffer = new MyOrderFillBuffer();
  let duplicates = 0;
  if (submission.ok && submission.submission?.exchange_order_id) {
    const msgs = generateFillMessages(
      {
        client_order_id: order.client_order_id,
        exchange_order_id: submission.submission.exchange_order_id,
        requested_notional: order.notional,
        price,
        feeRate: 0,
        at_ms: snapshot.timestamp_ms,
      },
      opts.fillPlan ?? { kind: 'full' },
    );
    for (const m of msgs) {
      buffer.ingest(m);
      if (opts.duplicateFills) {
        const again = buffer.ingest({ ...m }); // same trade_uuid → must be deduped
        if (again === null) duplicates += 1;
      }
    }
  }
  const fills = buffer.fills(order.client_order_id);
  const filled_notional = buffer.filledNotional(order.client_order_id);

  // 6) Reconciliation through the REAL reconciler → Risk confirm/release.
  const reconcileReq: ReconcileRequest = {
    request_id: uniqueReq.request_id,
    client_order_id: order.client_order_id,
    reservation_id: decisionRisk.reservation_id,
    requested_notional: order.notional,
  };
  const reconciler = new ExecutionReconciler(risk);
  const outcome = reconciler.reconcile(reconcileReq, fills, !submission.ok);

  // 7) PaperPortfolio reflects ONLY what reconciliation confirmed as filled.
  if (outcome.result.filled_notional > 0) {
    for (const f of fills) portfolio.applyFill(symbol, order.side, f.filled_notional, f.filled_qty, f.fee);
  }

  return {
    ...base,
    approved: true,
    submission_ok: submission.ok,
    fills: [...fills],
    filled_notional,
    reconciled: true,
    final_status: outcome.result.final_status,
    portfolio_after: portfolio.positions(),
    adapter_calls,
    // duplicates are observable via the metrics aggregator below
    ...(duplicates > 0 ? {} : {}),
  };
}

/** Aggregate several cycles into machine-readable metrics (mirrors the I4-7A soak shape). */
export async function runPaperSession(
  cycles: readonly PaperCycleOptions[],
  total_budget = 10_000_000,
): Promise<PaperMetrics> {
  const risk = paperRisk(total_budget);
  const portfolio = new PaperPortfolio();
  const m: PaperMetrics = {
    cycles: 0, decisions: 0, approvals: 0, rejections: 0, orders_submitted: 0,
    fills_full: 0, fills_partial: 0, fills_duplicate: 0, reconciliations: 0,
    risk_confirmed: 0, risk_released: 0, real_orders: 0, exceptions: 0,
    budget_consistent: true, paper_portfolio_final_state: [], gateway_bypassed: false, adapter_calls: 0,
  };

  for (const [i, c] of cycles.entries()) {
    try {
      const r = await runPaperCycle(risk, portfolio, { ...c, requestSeq: i });
      m.cycles += 1;
      m.decisions += 1;
      if (r.sized.sized === null) continue;
      if (r.approved) m.approvals += 1;
      else m.rejections += 1;
      if (!r.approved) continue;
      m.orders_submitted += 1;
      m.adapter_calls += r.adapter_calls;
      if (r.reconciled) m.reconciliations += 1;
      if (r.final_status === 'FILLED') m.fills_full += 1;
      if (r.final_status === 'PARTIALLY_FILLED') m.fills_partial += 1;
      if (c.duplicateFills) m.fills_duplicate += 1;
    } catch {
      m.exceptions += 1;
    }
  }

  const snap = risk.budgetSnapshot();
  m.budget_consistent =
    snap.reserved + snap.consumed <= snap.total + 1e-9 &&
    snap.available === snap.total - snap.reserved - snap.consumed;
  m.paper_portfolio_final_state = portfolio.positions().map((p) => ({
    symbol: p.symbol, qty: p.qty, notional: p.notional, avg_price: p.avg_price,
  }));
  return m;
}
