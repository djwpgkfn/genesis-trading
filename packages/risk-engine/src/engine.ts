import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { RiskStateMachine } from './state-machine.js';
import { RiskBudget } from './budget.js';
import { TokenRegistry } from './token.js';
import { checkExposure, drawdownBreached } from './limits.js';
import type { Limits, Position, RiskDecision, RiskState, TradeRequest } from './types.js';

export interface RiskEngineOpts {
  total_budget: number;
  limits: Limits;
  maxRecoveryAttempts?: number;
  now?: () => string;
}

/**
 * Risk Engine — the system's FINAL AUTHORITY. Nothing executes without a valid single-use
 * Approval Token issued here. Standalone (NOT wired to Production, S8).
 */
export class RiskEngine {
  private readonly sm: RiskStateMachine;
  private readonly budget: RiskBudget;
  private readonly tokens = new TokenRegistry();
  private readonly decisions = new Map<string, RiskDecision>(); // idempotency (INV-R7)
  private readonly now: () => string;
  private recoveryAttempts = 0;
  private eventSeq = 0;

  constructor(
    private readonly opts: RiskEngineOpts,
    private readonly log: EventStore = new InMemoryEventStore(),
  ) {
    this.now = opts.now ?? (() => new Date(0).toISOString());
    this.sm = new RiskStateMachine(this.log, this.now);
    this.budget = new RiskBudget(opts.total_budget);
  }

  state(): RiskState {
    return this.sm.current();
  }
  budgetSnapshot() {
    return this.budget.snapshot();
  }
  eventLog(): EventStore {
    return this.log;
  }

  private emit(type: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`risk-${type}-${++this.eventSeq}`),
      event_type: type,
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'risk-engine',
      schema_version: 1,
      correlation_id: asCorrelationId('risk'),
      snapshot_id: asSnapshotId('risk'),
      payload,
    };
    this.log.append(input);
  }

  // ---- lifecycle ----
  init(): void {
    // INIT → READY after startup checks. Never cold-starts into RUN (INV-R8).
    this.sm.transition('READY');
  }
  /** Explicit start approval: READY → RUN only (INV-R8, INV-R3). */
  start(): void {
    this.sm.transition('RUN');
  }
  enterSafeMode(): void {
    this.sm.transition('SAFE_MODE');
  }
  exitSafeMode(): void {
    this.sm.transition('RUN');
  }

  // ---- final-authority gate ----
  preTradeCheck(req: TradeRequest, positions: readonly Position[], equity: { peak: number; current: number }): RiskDecision {
    if (this.decisions.has(req.request_id)) return this.decisions.get(req.request_id)!; // idempotent (INV-R7)

    const st = this.state();
    const reject = (reason: string): RiskDecision => {
      const d: RiskDecision = { request_id: req.request_id, approved: false, reason };
      this.decisions.set(req.request_id, d);
      this.emit('Risk.decided', d);
      return d;
    };

    if (st !== 'RUN') return reject(`not RUN (state=${st})`); // no approval outside RUN (R3/R8)
    if (drawdownBreached(equity.peak, equity.current, this.opts.limits)) {
      this.emergencyHalt('drawdown breached');
      return reject('drawdown breached → HALT');
    }
    const exp = checkExposure(positions, req.symbol, req.notional, this.opts.limits);
    if (!exp.ok) return reject(exp.reason);

    const res = this.budget.reserve(req.request_id, req.notional);
    if (!res) return reject('insufficient budget'); // INV-R5

    const token = this.tokens.issue(req.request_id, res.reservation_id);
    const d: RiskDecision = {
      request_id: req.request_id, approved: true, reason: 'approved',
      token_id: token.token_id, reservation_id: res.reservation_id,
    };
    this.decisions.set(req.request_id, d);
    this.emit('Risk.decided', d);
    this.emit('Risk.budgetReserved', { reservation_id: res.reservation_id, amount: req.notional });
    return d;
  }

  /** The execution gate: authorize ONLY with a valid, unused token (INV-R1, R2). Single-use. */
  authorizeExecution(token_id: string): boolean {
    if (!this.tokens.use(token_id)) return false; // invalid/used/HALT-invalidated
    return true;
  }

  /** After a fill, move reservation reserved→consumed. */
  confirmFill(reservation_id: string): boolean {
    const ok = this.budget.consume(reservation_id);
    if (ok) this.emit('Risk.budgetConsumed', { reservation_id });
    return ok;
  }
  /** Release a reservation/position back to available budget. */
  release(reservation_id: string): boolean {
    const ok = this.budget.release(reservation_id);
    if (ok) this.emit('Risk.budgetReleased', { reservation_id });
    return ok;
  }

  // ---- emergency / recovery ----
  emergencyHalt(reason: string): void {
    if (this.state() === 'FROZEN') return;
    this.tokens.invalidateAll(); // INV-R2: all tokens void immediately
    this.sm.transition('HALT');
    this.emit('Risk.halted', { reason });
  }

  /** Reconciliation: system vs exchange positions. Mismatch → HALT (INV-R6). */
  reconcile(systemPositions: readonly Position[], exchangePositions: readonly Position[]): boolean {
    const key = (p: Position) => `${p.symbol}:${p.qty}`;
    const a = systemPositions.map(key).sort().join('|');
    const b = exchangePositions.map(key).sort().join('|');
    if (a !== b) {
      this.emergencyHalt('position reconciliation mismatch');
      return false;
    }
    return true;
  }

  /** Begin recovery: auto-checks only. Pass → READY (awaiting explicit approval). */
  startRecovery(autoChecks: () => boolean): void {
    this.sm.transition('RECOVERY'); // HALT → RECOVERY
    if (autoChecks()) {
      this.sm.transition('READY'); // RECOVERY → READY (still needs explicit start() for RUN)
      this.recoveryAttempts = 0;
      this.emit('Risk.recovered', {});
    } else {
      this.recoveryAttempts++;
      if (this.recoveryAttempts >= (this.opts.maxRecoveryAttempts ?? 3)) {
        this.sm.transition('FROZEN'); // manual intervention required
        this.emit('Risk.frozen', { attempts: this.recoveryAttempts });
      } else {
        this.sm.transition('HALT'); // back to HALT, retry later
      }
    }
  }
}
