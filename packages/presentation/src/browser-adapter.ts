import type { BrowserTransport } from './browser-transport.js';

/** Wire envelopes. Payloads are presentation DTOs only — no domain/runtime types. */
export type ServerEvent =
  | { type: 'snapshot'; payload: unknown }
  | { type: 'update'; payload: unknown }
  | { type: 'heartbeat' };

export function serializeEvent(event: ServerEvent): string {
  return JSON.stringify(event);
}
export function deserializeEvent(data: string): ServerEvent {
  return JSON.parse(data) as ServerEvent;
}

export interface BrowserAdapterOptions {
  transportFactory: () => BrowserTransport; // used for the initial connect and every reconnect
  heartbeatMs?: number;
  reconnectMs?: number;
}

/**
 * Thin transport adapter between Presentation and the Browser. Sends/receives DTO envelopes only.
 * Snapshot + incremental push, subscription fan-out, heartbeat, and reconnect. Every outbound call
 * is failure-isolated: a broken browser/transport never throws back into the caller (Runtime).
 */
export class BrowserAdapter {
  private transport: BrowserTransport | null = null;
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly opts: BrowserAdapterOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  private connect(): void {
    const t = this.opts.transportFactory();
    this.transport = t;
    t.onMessage((data) => this.dispatch(data));
    t.onClose(() => this.handleClose());
    this.startHeartbeat();
  }

  // ── Subscription Manager ──
  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private dispatch(data: string): void {
    let event: ServerEvent;
    try {
      event = deserializeEvent(data);
    } catch (e) {
      void e; // ignore malformed frames
      return;
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        void e; // a listener error must not break fan-out
      }
    }
  }

  // ── Snapshot Push + Incremental Update ──
  pushSnapshot(payload: unknown): boolean {
    return this.safeSend({ type: 'snapshot', payload });
  }
  pushUpdate(payload: unknown): boolean {
    return this.safeSend({ type: 'update', payload });
  }

  /** Failure-isolated send: transport errors are swallowed so Runtime is never affected. */
  private safeSend(event: ServerEvent): boolean {
    const t = this.transport;
    if (!t) return false;
    try {
      t.send(serializeEvent(event));
      return true;
    } catch (e) {
      void e;
      return false;
    }
  }

  // ── Heartbeat ──
  private startHeartbeat(): void {
    this.stopHeartbeat();
    const ms = this.opts.heartbeatMs ?? 15_000;
    this.heartbeatTimer = setInterval(() => this.safeSend({ type: 'heartbeat' }), ms);
    if (typeof this.heartbeatTimer.unref === 'function') this.heartbeatTimer.unref();
  }
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Reconnect ──
  private handleClose(): void {
    this.stopHeartbeat();
    this.transport = null;
    if (this.stopped) return;
    const ms = this.opts.reconnectMs ?? 1_000;
    this.reconnectTimer = setTimeout(() => this.connect(), ms);
    if (typeof this.reconnectTimer.unref === 'function') this.reconnectTimer.unref();
  }

  stop(): void {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.transport) {
      try {
        this.transport.close();
      } catch (e) {
        void e;
      }
      this.transport = null;
    }
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.transport !== null;
  }
}
