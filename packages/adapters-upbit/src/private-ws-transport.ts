import type { WsTransport, WsMessage } from '@genesis/data-layer';
import { systemNowMs } from '@genesis/contracts';
import { signUpbitJwt } from './jwt.js';
import type { UpbitConfig } from './config.js';
import { randomUUID } from 'node:crypto';

/**
 * I4-5 Upbit PRIVATE WebSocket transport (myOrder / myAsset).
 *
 * Same shape as the public `UpbitWsTransport` (implements the shared `WsTransport` interface, reuses
 * the WsCollector lifecycle), differing ONLY in that it authenticates the connection with a JWT
 * (reusing `signUpbitJwt`). Private streams live at `.../websocket/v1/private`.
 *
 * NOTE: `connect()` opens a REAL authenticated socket. It runs only in a networked env with valid
 * keys. Tests use a fake WsTransport, so no real private connection is ever made here.
 */
export class UpbitPrivateWsTransport implements WsTransport {
  private ws: WebSocket | null = null;
  private msgCb: ((m: WsMessage) => void) | null = null;
  private closeCb: (() => void) | null = null;

  constructor(
    private readonly cfg: UpbitConfig,
    private readonly keys: { accessKey: string; secretKey: string },
    private readonly privateWsUrl: string,
    private readonly now: () => number = systemNowMs,
  ) {}

  async connect(): Promise<void> {
    // Upbit private WS auth: Authorization: Bearer <JWT> on the upgrade request.
    const token = signUpbitJwt(this.keys);
    const ws = new WebSocket(this.privateWsUrl, { headers: { Authorization: `Bearer ${token}` } } as unknown as string);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Upbit private WS connect error'));
    });
    ws.onmessage = (ev: MessageEvent) => {
      const text = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data as ArrayBuffer).toString('utf8');
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      this.msgCb?.({ data, received_ms: this.now() });
    };
    ws.onclose = () => this.closeCb?.();
  }

  /** Build the private subscription for myOrder (and optionally specific codes). */
  static subscription(codes?: string[]): unknown[] {
    const spec = codes && codes.length ? { type: 'myOrder', codes } : { type: 'myOrder' };
    return [{ ticket: randomUUID() }, spec, { format: 'DEFAULT' }];
  }

  async subscribe(payload: unknown): Promise<void> {
    this.ws?.send(JSON.stringify(payload));
  }
  onMessage(cb: (m: WsMessage) => void): void { this.msgCb = cb; }
  onClose(cb: () => void): void { this.closeCb = cb; }
  async close(): Promise<void> { this.ws?.close(); }
}
