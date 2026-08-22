import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import type { AsyncExchangeAdapter, SubmissionResult } from './execution-contract.js';

export interface Order { client_order_id: string; symbol: string; side: 'buy' | 'sell'; notional: number }
export interface Fill { client_order_id: string; filled_notional: number; price: number }
export interface ExchangeAdapter { placeOrder(o: Order): Fill } // single external path (injected, sync)

export interface TokenVerifier { authorizeExecution(token_id: string): boolean }

/**
 * Kill switch checked at the gateway entry point (I4-2). When engaged, NO external adapter call
 * happens on either execute() or executeAsync(). It cannot create approvals or widen limits — it
 * can only block. Deterministic and injectable (so replay/tests reproduce it).
 */
export interface KillSwitch { isEngaged(): boolean }
const KILL_OFF: KillSwitch = { isEngaged: () => false }; // default: not engaged (sync path unchanged)

/**
 * The ONLY route by which an order reaches the exchange. Rejects any order without a valid Risk
 * Approval Token (INV-R1). Idempotent by client_order_id (INV-R7). External effects happen ONLY
 * here (so Replay, which never constructs a gateway, is side-effect-free — INV-E3).
 */
export class ExecutionGateway {
  private readonly done = new Set<string>();
  private n = 0;
  constructor(
    private readonly risk: TokenVerifier,
    private readonly adapter: ExchangeAdapter,
    private readonly correlationId: string,
    private readonly snapshotId: string,
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly now: () => string = () => new Date(0).toISOString(),
    // I4-2 additive optional deps — existing call sites (risk, adapter, corr, snap[, log, now]) unaffected.
    private readonly kill: KillSwitch = KILL_OFF,
    private readonly asyncAdapter?: AsyncExchangeAdapter,
  ) {}

  eventLog(): EventStore {
    return this.log;
  }

  execute(order: Order, token_id: string): { ok: boolean; reason: string; fill?: Fill } {
    if (this.done.has(order.client_order_id)) return { ok: true, reason: 'already-executed (idempotent)' };
    if (this.kill.isEngaged()) {
      this.emit('Order.rejected', { client_order_id: order.client_order_id, reason: 'kill-switch engaged' });
      return { ok: false, reason: 'kill-switch engaged' }; // no external call
    }
    if (!this.risk.authorizeExecution(token_id)) {
      this.emit('Order.rejected', { client_order_id: order.client_order_id, reason: 'no valid token' });
      return { ok: false, reason: 'no valid Risk token (INV-R1)' }; // tokenless order rejected
    }
    this.emit('Order.sent', order);
    const fill = this.adapter.placeOrder(order); // single external path (sync)
    this.done.add(order.client_order_id);
    this.emit('Fill.received', fill);
    return { ok: true, reason: 'filled', fill };
  }

  /**
   * I4-2 additive async execution boundary. Submits an order via the injected AsyncExchangeAdapter
   * and returns a SubmissionResult (acknowledgment — NOT a fill). Kill-switch and token are checked
   * BEFORE any adapter call. No fill/reconciliation happens here (I4-3+). Existing execute() sync
   * semantics are unchanged; existing callers do not use this method.
   */
  async executeAsync(order: Order, token_id: string): Promise<{ ok: boolean; reason: string; submission?: SubmissionResult }> {
    if (this.done.has(order.client_order_id)) return { ok: true, reason: 'already-submitted (idempotent)' };
    if (this.kill.isEngaged()) {
      this.emit('Order.rejected', { client_order_id: order.client_order_id, reason: 'kill-switch engaged' });
      return { ok: false, reason: 'kill-switch engaged' }; // no external call
    }
    if (!this.risk.authorizeExecution(token_id)) {
      this.emit('Order.rejected', { client_order_id: order.client_order_id, reason: 'no valid token' });
      return { ok: false, reason: 'no valid Risk token (INV-R1)' };
    }
    if (!this.asyncAdapter) return { ok: false, reason: 'no async adapter configured' }; // fail-closed
    this.emit('Order.sent', order);
    let submission: SubmissionResult;
    try {
      submission = await this.asyncAdapter.submitOrder(order); // submit only — not a fill
    } catch (e) {
      this.emit('Order.rejected', { client_order_id: order.client_order_id, reason: 'submit failed' });
      return { ok: false, reason: `submit failed: ${e instanceof Error ? e.message : 'unknown'}` }; // fail-closed
    }
    this.done.add(order.client_order_id);
    this.emit('Order.submitted', submission); // acknowledgment, not Fill.received
    return { ok: submission.status !== 'REJECTED', reason: submission.reason, submission };
  }

  private emit(type: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`exec-${type}-${++this.n}`), event_type: type,
      event_time: asISOTimestamp(this.now()), ingest_time: asISOTimestamp(this.now()),
      source_engine: 'execution-gateway', schema_version: 1,
      correlation_id: asCorrelationId(this.correlationId), snapshot_id: asSnapshotId(this.snapshotId),
      payload,
    };
    this.log.append(input);
  }
}
