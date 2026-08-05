import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';

export interface Order { client_order_id: string; symbol: string; side: 'buy' | 'sell'; notional: number }
export interface Fill { client_order_id: string; filled_notional: number; price: number }
export interface ExchangeAdapter { placeOrder(o: Order): Fill } // single external path (injected)

export interface TokenVerifier { authorizeExecution(token_id: string): boolean }

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
  ) {}

  eventLog(): EventStore {
    return this.log;
  }

  execute(order: Order, token_id: string): { ok: boolean; reason: string; fill?: Fill } {
    if (this.done.has(order.client_order_id)) return { ok: true, reason: 'already-executed (idempotent)' };
    if (!this.risk.authorizeExecution(token_id)) {
      this.emit('Order.rejected', { client_order_id: order.client_order_id, reason: 'no valid token' });
      return { ok: false, reason: 'no valid Risk token (INV-R1)' }; // tokenless order rejected
    }
    this.emit('Order.sent', order);
    const fill = this.adapter.placeOrder(order); // single external path
    this.done.add(order.client_order_id);
    this.emit('Fill.received', fill);
    return { ok: true, reason: 'filled', fill };
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
