import type { WsTransport, WsMessage } from './transport.js';

/**
 * Upbit WebSocket transport binding (public streams: ticker/trade/orderbook).
 * NOTE: requires a WebSocket impl (e.g. `ws`) provided in the runtime env; kept as a thin
 * binding so the collector logic stays testable via a fake transport. Finalized in a
 * networked environment. Subscription format example:
 *   [{ ticket }, { type: 'trade', codes: ['KRW-BTC'] }, { format: 'SIMPLE' }]
 */
export interface WebSocketLike {
  on(ev: 'open' | 'message' | 'close', cb: (arg?: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

export class UpbitWsTransport implements WsTransport {
  private ws: WebSocketLike | null = null;
  private msgCb: ((m: WsMessage) => void) | null = null;
  private closeCb: (() => void) | null = null;

  constructor(
    private readonly factory: () => WebSocketLike, // () => new WebSocket('wss://api.upbit.com/websocket/v1')
    private readonly now: () => number,
  ) {}

  async connect(): Promise<void> {
    const ws = this.factory();
    this.ws = ws;
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));
    ws.on('message', (data) => this.msgCb?.({ data, received_ms: this.now() }));
    ws.on('close', () => this.closeCb?.());
  }
  async subscribe(payload: unknown): Promise<void> {
    this.ws?.send(JSON.stringify(payload));
  }
  onMessage(cb: (m: WsMessage) => void): void {
    this.msgCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
  async close(): Promise<void> {
    this.ws?.close();
  }
}
