import type { WsTransport, WsMessage } from '@genesis/data-layer';
import { systemNowMs } from '@genesis/contracts';
import type { UpbitConfig } from './config.js';
import { randomUUID } from 'node:crypto';

/** Real Upbit public WebSocket transport (ticker/trade/orderbook). Node 22 global WebSocket. */
export class UpbitWsTransport implements WsTransport {
  private ws: WebSocket | null = null;
  private msgCb: ((m: WsMessage) => void) | null = null;
  private closeCb: (() => void) | null = null;

  constructor(
    private readonly cfg: UpbitConfig,
    private readonly now: () => number = systemNowMs,
  ) {}

  async connect(): Promise<void> {
    const ws = new WebSocket(this.cfg.wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Upbit WS connect error'));
    });
    ws.onmessage = (ev: MessageEvent) => {
      const text =
        typeof ev.data === 'string'
          ? ev.data
          : Buffer.from(ev.data as ArrayBuffer).toString('utf8');
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      this.msgCb?.({ data, received_ms: this.now() });
    };
    ws.onclose = () => this.closeCb?.();
  }

  /** Build Upbit subscription. `spec` = [{type,codes}] entries. */
  static subscription(
    spec: Array<{ type: 'ticker' | 'trade' | 'orderbook'; codes: string[] }>,
  ): unknown[] {
    return [{ ticket: randomUUID() }, ...spec, { format: 'DEFAULT' }];
  }

  async subscribe(payload: unknown): Promise<void> {
    this.ws?.send(JSON.stringify(payload));
  }

  /** Upbit keepalive — sends PING; server replies with a status/PONG message. */
  async ping(): Promise<void> {
    this.ws?.send('PING');
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
