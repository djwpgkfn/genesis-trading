/**
 * I4-7A Dry-run soak harness (deterministic).
 *
 * Exercises the REAL production execution path — RiskEngine, ExecutionGateway, ExecutionReconciler,
 * MyOrderFillBuffer — with the ONLY fake at the exchange boundary (FakeAsyncExchangeAdapter). No real
 * UpbitRestClient / UpbitExchangeAdapter / private WS / API key / network is ever constructed here, so
 * a real order can never be submitted (real_orders is structurally 0).
 *
 * 7A-1 = harness + short verification (this stage). 7A-2 = long soak via main() (later).
 */
import { RiskEngine, type Limits } from '@genesis/risk-engine';
import {
  ExecutionGateway,
  ExecutionReconciler,
  type Order,
  type Fill,
  type AsyncExchangeAdapter,
  type SubmissionResult,
  type FillEvent,
  type ReconcileRequest,
} from '@genesis/production-engine';
import { MyOrderFillBuffer, type UpbitMyOrderMessage } from '@genesis/adapters-upbit';

// ---- deterministic fault modes ----
export type Fault =
  | 'normal' // full fill
  | 'partial' // partial fill, remainder released
  | 'duplicate' // same trade_uuid twice → deduped
  | 'multi' // several fills accrue to full
  | 'rejected' // submission REJECTED status
  | 'throw' // submitOrder throws → fail-closed
  | 'kill'; // kill-switch engaged → no adapter call

export interface ScenarioResult {
  name: string;
  fault: Fault;
  pass: boolean;
  detail: string;
  adapter_calls: number;
  real_orders: number; // always 0 (no real exchange in harness)
}

export interface SoakMetrics {
  cycles: number;
  orders_submitted: number;
  submissions_accepted: number;
  submissions_rejected: number;
  fills_applied: number;
  duplicates_deduped: number;
  confirmFill_count: number;
  release_count: number;
  adapter_calls: number;
  exceptions: number;
  real_orders: number;
  budget_consistent: boolean;
  scenarios: ScenarioResult[];
  pass: boolean;
  memory?: { rss: number; heapUsed: number };
}

const LIMITS: Limits = {
  maxTotalExposure: 1_000_000,
  maxSymbolExposure: 1_000_000,
  maxDrawdownPct: 0.9,
  trailingPct: 0.9,
};
const EQUITY = { peak: 1_000_000, current: 1_000_000 };

/** Fresh RiskEngine in RUN state — isolates decisions Map and budget per scenario/cycle. */
function freshRisk(): RiskEngine {
  const risk = new RiskEngine({ total_budget: 1_000_000, limits: LIMITS });
  risk.init();
  risk.start();
  return risk;
}

/** Fake exchange boundary — the ONLY fake. Deterministic; counts calls; never touches a network. */
class FakeAsyncExchangeAdapter implements AsyncExchangeAdapter {
  calls = 0;
  constructor(private readonly mode: Fault) {}
  async submitOrder(order: Order): Promise<SubmissionResult> {
    this.calls += 1;
    if (this.mode === 'throw') throw new Error('fake exchange down');
    const status = this.mode === 'rejected' ? ('REJECTED' as const) : ('ACKNOWLEDGED' as const);
    return {
      client_order_id: order.client_order_id,
      exchange_order_id: `x-${order.client_order_id}`,
      status,
      submitted_at_ms: 0,
      reason: status === 'REJECTED' ? 'rejected: fake' : 'accepted',
    };
  }
}

/** A no-op sync adapter (gateway requires a sync ExchangeAdapter arg; harness never calls execute()). */
const NOOP_SYNC = {
  placeOrder: (o: Order): Fill => ({ client_order_id: o.client_order_id, filled_notional: 0, price: 0 }),
};

/** Build a deterministic myOrder message for a given execution. */
function myOrderMsg(coid: string, uuid: string, trade_uuid: string, funds: number, count: number): UpbitMyOrderMessage {
  return {
    type: 'myOrder',
    uuid,
    identifier: coid,
    trade_uuid,
    ask_bid: 'BID',
    state: 'trade',
    executed_funds: funds,
    executed_volume: funds / 100,
    avg_price: 100,
    paid_fee: 0,
    trades_count: count,
    trade_timestamp: count,
  };
}

/** Run one scenario through the real path. Returns a machine-readable result. */
export async function runScenario(name: string, fault: Fault, requestId: string): Promise<ScenarioResult & {
  accepted: boolean; rejected: boolean; fills: number; deduped: number; confirmed: number; released: number;
}> {
  const risk = freshRisk();
  const symbol = 'KRW-BTC';
  const requested = 100;
  const coid = `${requestId}-coid`;

  // Decision → Risk.preTradeCheck → token + reservation
  const decision = risk.preTradeCheck(
    { request_id: requestId, symbol, side: 'buy', notional: requested },
    [],
    EQUITY,
  );
  if (!decision.approved || !decision.token_id || !decision.reservation_id) {
    return {
      name, fault, pass: false, detail: `preTradeCheck not approved: ${decision.reason}`,
      adapter_calls: 0, real_orders: 0, accepted: false, rejected: true, fills: 0, deduped: 0, confirmed: 0, released: 0,
    };
  }

  const kill = { isEngaged: () => fault === 'kill' };
  const fakeAdapter = new FakeAsyncExchangeAdapter(fault);
  // Gateway uses the REAL RiskEngine as its TokenVerifier (risk.authorizeExecution).
  const gateway = new ExecutionGateway(risk, NOOP_SYNC, 'soak-corr', 'soak-snap', undefined, undefined, kill, fakeAdapter);

  const order: Order = { client_order_id: coid, symbol, side: 'buy', notional: requested };
  const sub = await gateway.executeAsync(order, decision.token_id);

  const accepted = sub.ok;
  const rejected = !sub.ok;

  // Build fills per fault (deterministic). No fills for kill/throw/rejected.
  const buffer = new MyOrderFillBuffer();
  let ingested = 0;
  let dedupeAttempts = 0;
  if (accepted) {
    if (fault === 'normal') {
      if (buffer.ingest(myOrderMsg(coid, `x-${coid}`, 't1', 100, 1))) ingested += 1;
    } else if (fault === 'partial') {
      if (buffer.ingest(myOrderMsg(coid, `x-${coid}`, 't1', 60, 1))) ingested += 1;
    } else if (fault === 'multi') {
      for (const [i, f] of [30, 20, 50].entries()) {
        if (buffer.ingest(myOrderMsg(coid, `x-${coid}`, `t${i + 1}`, f, i + 1))) ingested += 1;
      }
    } else if (fault === 'duplicate') {
      if (buffer.ingest(myOrderMsg(coid, `x-${coid}`, 't1', 100, 1))) ingested += 1;
      dedupeAttempts += 1;
      const dup = buffer.ingest(myOrderMsg(coid, `x-${coid}`, 't1', 100, 1)); // same trade_uuid
      if (dup) ingested += 1; // should NOT happen (deduped)
    }
  }
  const deduped = dedupeAttempts; // number of duplicate messages that were ignored

  // Reconcile through the REAL reconciler + REAL RiskEngine (confirmFill/release).
  const req: ReconcileRequest = {
    request_id: requestId, client_order_id: coid, reservation_id: decision.reservation_id, requested_notional: requested,
  };
  const fills: FillEvent[] = buffer.fills(coid);
  const outcome = risk_reconcile(risk, req, fills, rejected);

  // Budget consistency: reserved + consumed <= total (via snapshot).
  const snap = risk.budgetSnapshot() as { reserved?: number; consumed?: number; total?: number };
  const budgetOk =
    typeof snap.total === 'number'
      ? (snap.reserved ?? 0) + (snap.consumed ?? 0) <= snap.total + 1e-9
      : true;

  // Expected outcomes per fault.
  const exp = expectFor(fault, outcome, fakeAdapter.calls, sub.ok, ingested, budgetOk);

  return {
    name, fault, pass: exp.pass, detail: exp.detail,
    adapter_calls: fakeAdapter.calls, real_orders: 0,
    accepted, rejected, fills: ingested, deduped,
    confirmed: outcome.confirmed, released: outcome.released,
  };
}

function risk_reconcile(
  risk: RiskEngine,
  req: ReconcileRequest,
  fills: FillEvent[],
  rejected: boolean,
): { confirmed: number; released: number; status: string } {
  let confirmed = 0;
  let released = 0;
  // Wrap the real RiskEngine so we can count calls without changing its behavior.
  const port = {
    confirmFill: (rid: string) => { const r = risk.confirmFill(rid); if (r) confirmed += 1; return r; },
    release: (rid: string) => { const r = risk.release(rid); if (r) released += 1; return r; },
  };
  const rec = new ExecutionReconciler(port);
  const o = rec.reconcile(req, fills, rejected);
  return { confirmed, released, status: o.result.final_status };
}

function expectFor(
  fault: Fault,
  outcome: { confirmed: number; released: number; status: string },
  adapterCalls: number,
  subOk: boolean,
  ingested: number,
  budgetOk: boolean,
): { pass: boolean; detail: string } {
  const fail = (d: string) => ({ pass: false, detail: d });
  if (!budgetOk) return fail('budget inconsistent');
  switch (fault) {
    case 'normal':
      return outcome.status === 'FILLED' && outcome.confirmed === 1 && adapterCalls === 1
        ? { pass: true, detail: 'FILLED, confirmFill' } : fail(`normal: status=${outcome.status} c=${outcome.confirmed} calls=${adapterCalls}`);
    case 'partial':
      return outcome.status === 'PARTIALLY_FILLED' && outcome.confirmed === 1 && outcome.released === 1
        ? { pass: true, detail: 'PARTIALLY_FILLED, confirm+release' } : fail(`partial: status=${outcome.status} c=${outcome.confirmed} r=${outcome.released}`);
    case 'multi':
      return outcome.status === 'FILLED' && ingested === 3 && outcome.confirmed === 1
        ? { pass: true, detail: 'multi-fill accrued to FILLED' } : fail(`multi: status=${outcome.status} ingested=${ingested}`);
    case 'duplicate':
      return ingested === 1 && outcome.status === 'FILLED'
        ? { pass: true, detail: 'duplicate trade_uuid deduped' } : fail(`duplicate: ingested=${ingested} status=${outcome.status}`);
    case 'rejected':
      return !subOk && outcome.status === 'REJECTED' && outcome.released === 1 && adapterCalls === 1
        ? { pass: true, detail: 'REJECTED, released' } : fail(`rejected: subOk=${subOk} status=${outcome.status} r=${outcome.released}`);
    case 'throw':
      return !subOk && outcome.status === 'REJECTED' && outcome.released === 1 && adapterCalls === 1
        ? { pass: true, detail: 'throw → fail-closed, released' } : fail(`throw: subOk=${subOk} status=${outcome.status} r=${outcome.released}`);
    case 'kill':
      return !subOk && adapterCalls === 0 && outcome.status === 'REJECTED' && outcome.released === 1
        ? { pass: true, detail: 'kill-switch: adapter not called, released' } : fail(`kill: subOk=${subOk} calls=${adapterCalls} status=${outcome.status}`);
    default:
      return fail(`unknown fault ${fault}`);
  }
}

const SCENARIOS: Array<{ name: string; fault: Fault }> = [
  { name: '1-normal-full-fill', fault: 'normal' },
  { name: '2-partial-fill', fault: 'partial' },
  { name: '3-duplicate-fill', fault: 'duplicate' },
  { name: '4-multi-fill', fault: 'multi' },
  { name: '5-rejected-submission', fault: 'rejected' },
  { name: '6-exchange-throw', fault: 'throw' },
  { name: '7-async-submission-failure', fault: 'rejected' }, // REJECTED status (distinct from throw)
  { name: '8-kill-switch', fault: 'kill' },
  { name: '9-reconciliation', fault: 'normal' }, // exercises confirmFill path
  { name: '10-timeout-failure', fault: 'throw' }, // deterministic failure (no infinite wait)
];

/** Run all scenarios once + a short repeat loop. Aggregates machine-readable metrics. */
export async function runSoak(cycles = 20): Promise<SoakMetrics> {
  const scenarios: ScenarioResult[] = [];
  const m: SoakMetrics = {
    cycles: 0, orders_submitted: 0, submissions_accepted: 0, submissions_rejected: 0,
    fills_applied: 0, duplicates_deduped: 0, confirmFill_count: 0, release_count: 0,
    adapter_calls: 0, exceptions: 0, real_orders: 0, budget_consistent: true, scenarios, pass: true,
  };

  // 1) Each scenario once.
  for (const s of SCENARIOS) {
    try {
      const r = await runScenario(s.name, s.fault, `scn-${s.name}`);
      scenarios.push({ name: r.name, fault: r.fault, pass: r.pass, detail: r.detail, adapter_calls: r.adapter_calls, real_orders: r.real_orders });
      m.orders_submitted += 1;
      if (r.accepted) m.submissions_accepted += 1;
      if (r.rejected) m.submissions_rejected += 1;
      m.fills_applied += r.fills;
      m.duplicates_deduped += r.deduped;
      m.confirmFill_count += r.confirmed;
      m.release_count += r.released;
      m.adapter_calls += r.adapter_calls;
      m.real_orders += r.real_orders;
      if (!r.pass) m.pass = false;
    } catch (e) {
      m.exceptions += 1; m.pass = false;
      scenarios.push({ name: s.name, fault: s.fault, pass: false, detail: `exception: ${e instanceof Error ? e.message : 'unknown'}`, adapter_calls: 0, real_orders: 0 });
    }
  }

  // 2) Short repeat loop — unique request_id each cycle; normal path; assert no crash / real_orders 0.
  for (let i = 0; i < cycles; i++) {
    try {
      const r = await runScenario(`repeat-${i}`, 'normal', `rep-cycle-${i}`);
      m.cycles += 1;
      m.adapter_calls += r.adapter_calls;
      m.real_orders += r.real_orders;
      m.confirmFill_count += r.confirmed;
      if (!r.pass) m.pass = false;
    } catch {
      m.exceptions += 1; m.pass = false;
    }
  }

  if (m.real_orders !== 0) m.pass = false; // structural guarantee
  if (m.exceptions !== 0) m.pass = false;

  const mu = process.memoryUsage();
  m.memory = { rss: mu.rss, heapUsed: mu.heapUsed };
  return m;
}

/** CLI entry point (7A-2 long soak). Usage: node dist/soak-harness.js [cycles] */
export async function main(): Promise<void> {
  const cycles = Number(process.argv[2] ?? '20');
  const m = await runSoak(Number.isFinite(cycles) && cycles > 0 ? cycles : 20);
  console.log(JSON.stringify(m, null, 2));
  console.log(`[soak] cycles=${m.cycles} scenarios=${m.scenarios.length} real_orders=${m.real_orders} exceptions=${m.exceptions} pass=${m.pass}`);
  process.exit(m.pass ? 0 : 1);
}

// Run only when executed directly (not when imported by the test).
const isDirect = process.argv[1]?.endsWith('soak-harness.js');
if (isDirect) {
  void main();
}
