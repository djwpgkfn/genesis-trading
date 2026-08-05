import type { CheckResult } from '@genesis/invariant-runner';
import { RiskEngine } from './engine.js';
import type { Limits, Position, TradeRequest } from './types.js';

const limits: Limits = { maxTotalExposure: 1000, maxSymbolExposure: 600, maxDrawdownPct: 0.2, trailingPct: 0.1 };
const eq = { peak: 100, current: 100 };
const noPos: Position[] = [];
const req = (id: string, notional = 100): TradeRequest => ({ request_id: id, symbol: 'KRW-BTC', side: 'buy', notional });
function running(total = 1000): RiskEngine {
  const e = new RiskEngine({ total_budget: total, limits });
  e.init();
  e.start();
  return e;
}

/** INV-R1: no execution authorization without a valid token. */
function checkR1(): CheckResult {
  const e = running();
  return e.authorizeExecution('nope') === false
    ? { id: 'INV-R1', status: 'pass' }
    : { id: 'INV-R1', status: 'fail' };
}

/** INV-R2: token single-use + invalidated on HALT. */
function checkR2(): CheckResult {
  const e = running();
  const d = e.preTradeCheck(req('r1'), noPos, eq);
  const firstUse = e.authorizeExecution(d.token_id!);
  const secondUse = e.authorizeExecution(d.token_id!); // single-use → false
  const e2 = running();
  const d2 = e2.preTradeCheck(req('r2'), noPos, eq);
  e2.emergencyHalt('x');
  const afterHalt = e2.authorizeExecution(d2.token_id!); // invalidated → false
  return firstUse && !secondUse && !afterHalt
    ? { id: 'INV-R2', status: 'pass' }
    : { id: 'INV-R2', status: 'fail' };
}

/** INV-R3: HALT latching — cannot reach RUN without RECOVERY→READY→approval. */
function checkR3(): CheckResult {
  const e = running();
  e.emergencyHalt('x');
  let direct = false;
  try { e.start(); direct = true; } catch { /* invalid transition expected */ }
  e.startRecovery(() => true); // → READY
  e.start(); // READY → RUN
  return !direct && e.state() === 'RUN'
    ? { id: 'INV-R3', status: 'pass' }
    : { id: 'INV-R3', status: 'fail', detail: e.state() };
}

/** INV-R4/R5: reserved+consumed<=total; over-budget rejected. */
function checkR4R5(): CheckResult {
  const e = running(150);
  const a = e.preTradeCheck(req('a', 100), noPos, eq);
  const b = e.preTradeCheck(req('b', 100), noPos, eq); // would exceed 150 → rejected
  const snap = e.budgetSnapshot();
  const ok = a.approved && !b.approved && snap.reserved + snap.consumed <= snap.total;
  return ok ? { id: 'INV-R4', status: 'pass' } : { id: 'INV-R4', status: 'fail', detail: JSON.stringify(snap) };
}

/** INV-R6: position reconcile mismatch → HALT. */
function checkR6(): CheckResult {
  const e = running();
  e.reconcile([{ symbol: 'KRW-BTC', qty: 1, notional: 100 }], [{ symbol: 'KRW-BTC', qty: 2, notional: 200 }]);
  return e.state() === 'HALT' ? { id: 'INV-R6', status: 'pass' } : { id: 'INV-R6', status: 'fail' };
}

/** INV-R7: idempotent — same request_id never double-approved. */
function checkR7(): CheckResult {
  const e = running();
  const a = e.preTradeCheck(req('same', 100), noPos, eq);
  const b = e.preTradeCheck(req('same', 100), noPos, eq);
  const snap = e.budgetSnapshot();
  return a.token_id === b.token_id && snap.reserved === 100
    ? { id: 'INV-R7', status: 'pass' }
    : { id: 'INV-R7', status: 'fail' };
}

/** INV-R8: no cold-start into RUN. */
function checkR8(): CheckResult {
  const e = new RiskEngine({ total_budget: 1000, limits });
  let cold = false;
  try { e.start(); cold = true; } catch { /* INIT→RUN invalid */ }
  return !cold && e.state() === 'INIT'
    ? { id: 'INV-R8', status: 'pass' }
    : { id: 'INV-R8', status: 'fail' };
}

/** INV-S1: invalid transitions rejected; state event-sourced. */
function checkS1(): CheckResult {
  const e = running();
  const recorded = e.eventLog().all().some((ev) => ev.event_type === 'State.transitioned');
  let invalid = false;
  try { (e as unknown as { sm: { transition: (s: string) => void } }).sm.transition('FROZEN'); invalid = true; } catch { /* RUN→FROZEN invalid */ }
  return recorded && !invalid ? { id: 'INV-S1', status: 'pass' } : { id: 'INV-S1', status: 'fail' };
}

export const riskChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-R1', fn: checkR1 },
  { id: 'INV-R2', fn: checkR2 },
  { id: 'INV-R3', fn: checkR3 },
  { id: 'INV-R4', fn: checkR4R5 },
  { id: 'INV-R6', fn: checkR6 },
  { id: 'INV-R7', fn: checkR7 },
  { id: 'INV-R8', fn: checkR8 },
  { id: 'INV-S1', fn: checkS1 },
];
