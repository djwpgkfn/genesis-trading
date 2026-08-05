// Real-time Upbit WebSocket collector: subscribes ticker+trade, logs structured JSON,
// persists each event to a Raw Store (append-only landing), reconnects with exponential
// backoff, and heartbeats. App/composition layer only — no Contracts/architecture changes.
import { UpbitWsTransport, type UpbitConfig } from '@genesis/adapters-upbit';
import { StructuredLogger } from '@genesis/ops';
import type { WsTransport, WsMessage, RawStore, RawRecord, MarketDataKind } from '@genesis/data-layer';
import { asISOTimestamp } from '@genesis/contracts';
import type { Clock } from './container.js';

export interface StreamTransport extends WsTransport {
  ping(): Promise<void>;
}
export type TransportFactory = () => StreamTransport;

export interface CollectorOptions {
  codes?: string[];
  heartbeatMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  progressEvery?: number;
}

/** Map an Upbit ws ticker/trade message to an append-only RawRecord. Returns null for other types. */
export function toRawRecord(m: WsMessage, seq: number): RawRecord | null {
  const data = (m.data ?? {}) as Record<string, unknown>;
  const type = data['type'];
  if (type !== 'ticker' && type !== 'trade') return null;
  const eventMs = Number(data['timestamp'] ?? data['trade_timestamp'] ?? m.received_ms);
  const ingestMs = m.received_ms;
  return {
    kind: type as MarketDataKind,
    symbol: String(data['code'] ?? ''),
    event_time: asISOTimestamp(new Date(eventMs).toISOString()),
    ingest_time: asISOTimestamp(new Date(ingestMs).toISOString()),
    event_time_ms: eventMs,
    ingest_time_ms: ingestMs,
    seq,
    payload: data,
  };
}

export class WebSocketCollector {
  private transport: StreamTransport | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private backoffMs: number;
  private seq = 0;
  private readonly codes: string[];
  private readonly heartbeatMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly progressEvery: number;
  private readonly makeTransport: TransportFactory;

  constructor(
    cfg: UpbitConfig,
    private readonly logger: StructuredLogger,
    private readonly clock: Clock,
    opts: CollectorOptions = {},
    transportFactory?: TransportFactory,
    private readonly rawStore?: RawStore,
  ) {
    this.codes = opts.codes ?? ['KRW-BTC'];
    this.heartbeatMs = opts.heartbeatMs ?? 30_000;
    this.initialBackoffMs = opts.initialBackoffMs ?? 1_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
    this.progressEvery = opts.progressEvery ?? 500;
    this.backoffMs = this.initialBackoffMs;
    this.makeTransport = transportFactory ?? (() => new UpbitWsTransport(cfg, () => this.clock.now()));
  }

  /** Number of raw records persisted so far. */
  storedCount(): number {
    return this.seq;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearHeartbeat();
    await this.transport?.close();
  }

  private async connect(): Promise<void> {
    const transport = this.makeTransport();
    this.transport = transport;
    transport.onMessage((m) => this.onMessage(m));
    transport.onClose(() => this.onClose());
    try {
      await transport.connect();
      this.backoffMs = this.initialBackoffMs;
      this.logger.info('ws connected', { trace_id: `ws-${this.clock.now()}` }, { codes: this.codes });
      await transport.subscribe(
        UpbitWsTransport.subscription([
          { type: 'ticker', codes: this.codes },
          { type: 'trade', codes: this.codes },
        ]),
      );
      this.startHeartbeat();
    } catch (e) {
      this.logger.warn('ws connect failed', {}, { error: e instanceof Error ? e.message : String(e) });
      this.scheduleReconnect();
    }
  }

  private onMessage(m: WsMessage): void {
    const data = (m.data ?? {}) as Record<string, unknown>;
    const stream = String(data['type'] ?? 'unknown');
    this.logger.info(
      'ws event',
      { trace_id: `ws-${m.received_ms}` },
      { stream, code: data['code'], trade_price: data['trade_price'], received_ms: m.received_ms },
    );

    // Persist to the append-only Raw Store (L1 landing).
    if (this.rawStore) {
      const rec = toRawRecord(m, this.seq);
      if (rec) {
        this.rawStore.append(rec);
        this.seq += 1;
        if (this.seq % this.progressEvery === 0) {
          this.logger.info('raw store progress', {}, { stored: this.seq });
        }
      }
    }
  }

  private onClose(): void {
    this.clearHeartbeat();
    this.logger.warn('ws closed', {}, { will_reconnect: !this.stopped });
    if (!this.stopped) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = this.backoffMs;
    this.logger.info('ws reconnect scheduled', {}, { delay_ms: delay });
    setTimeout(() => {
      void this.connect();
    }, delay);
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeat = setInterval(() => {
      void this.transport
        ?.ping()
        .catch((e) => this.logger.warn('ws ping failed', {}, { error: e instanceof Error ? e.message : String(e) }));
    }, this.heartbeatMs);
    if (typeof this.heartbeat.unref === 'function') this.heartbeat.unref();
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
