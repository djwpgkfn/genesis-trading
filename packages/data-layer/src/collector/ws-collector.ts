import type { RawStore } from '../landing/raw-store.js';
import type { RawRecord } from '../types.js';
import type { WsMessage, WsTransport } from './transport.js';

export interface CollectorOptions {
  subscribe: unknown;                 // exchange subscription payload
  parse: (m: WsMessage) => RawRecord | null; // exchange-specific decode → raw record
  now: () => number;                  // injected clock (determinism; no Date.now in logic)
  heartbeatMs?: number;               // idle guard (Upbit disconnects ~120s)
  maxBackoffMs?: number;
}

/**
 * WS collector: heartbeat, reconnect w/ backoff, lossless buffering.
 * Lossless: every parsed record is appended to the store on receipt; on reconnect it
 * resubscribes and continues. The store is append-only (INV-E1); no record is dropped
 * on transient disconnects because writes happen synchronously on receipt.
 */
export class WsCollector {
  private closed = false;
  private backoff = 500;
  private lastMsgMs = 0;

  constructor(
    private readonly transport: WsTransport,
    private readonly store: RawStore,
    private readonly opts: CollectorOptions,
  ) {}

  async start(): Promise<void> {
    this.transport.onMessage((m) => this.onMessage(m));
    this.transport.onClose(() => this.onClose());
    await this.connectLoop();
  }

  private onMessage(m: WsMessage): void {
    this.lastMsgMs = this.opts.now();
    const rec = this.opts.parse(m);
    if (rec) this.store.append(rec); // lossless: persist immediately
    this.backoff = 500; // healthy connection resets backoff
  }

  private async connectLoop(): Promise<void> {
    if (this.closed) return;
    await this.transport.connect();
    await this.transport.subscribe(this.opts.subscribe);
    this.lastMsgMs = this.opts.now();
  }

  private async onClose(): Promise<void> {
    if (this.closed) return;
    const wait = Math.min(this.backoff, this.opts.maxBackoffMs ?? 30_000);
    this.backoff = Math.min(this.backoff * 2, this.opts.maxBackoffMs ?? 30_000);
    await new Promise((r) => setTimeout(r, wait));
    await this.connectLoop(); // resubscribe on reconnect
  }

  /** True if no message within heartbeat window → caller should recycle the socket. */
  isStale(): boolean {
    const hb = this.opts.heartbeatMs ?? 100_000; // < 120s Upbit idle limit
    return this.opts.now() - this.lastMsgMs > hb;
  }

  async stop(): Promise<void> {
    this.closed = true;
    await this.transport.close();
  }
}
