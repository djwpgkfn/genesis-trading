import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BrowserTransport } from './browser-transport.js';
import { createWebSocketTransport, type WebSocketLike } from './browser-transport.js';
import {
  BrowserAdapter,
  serializeEvent,
  deserializeEvent,
  type ServerEvent,
} from './browser-adapter.js';

class MockTransport implements BrowserTransport {
  sent: string[] = [];
  closed = false;
  private msg?: (d: string) => void;
  private cls?: () => void;
  throwOnSend = false;
  send(d: string): void {
    if (this.throwOnSend) throw new Error('transport down');
    this.sent.push(d);
  }
  onMessage(h: (d: string) => void): void {
    this.msg = h;
  }
  onClose(h: () => void): void {
    this.cls = h;
  }
  close(): void {
    this.closed = true;
  }
  emit(d: string): void {
    this.msg?.(d);
  }
  triggerClose(): void {
    this.cls?.();
  }
}

describe('P2 Browser Adapter / Transport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('Serialization: event serialize/deserialize round-trips', () => {
    const events: ServerEvent[] = [
      { type: 'snapshot', payload: { frames: [], history: [] } },
      { type: 'update', payload: { index: 1 } },
      { type: 'heartbeat' },
    ];
    for (const e of events) expect(deserializeEvent(serializeEvent(e))).toEqual(e);
  });

  it('Snapshot Push: sends a snapshot envelope with the DTO payload', () => {
    const t = new MockTransport();
    const a = new BrowserAdapter({ transportFactory: () => t });
    a.start();
    const dto = { frames: [{ index: 0 }], history: [] };
    expect(a.pushSnapshot(dto)).toBe(true);
    expect(deserializeEvent(t.sent.at(-1)!)).toEqual({ type: 'snapshot', payload: dto });
    a.stop();
  });

  it('Incremental Update: sends an update envelope', () => {
    const t = new MockTransport();
    const a = new BrowserAdapter({ transportFactory: () => t });
    a.start();
    a.pushUpdate({ index: 2 });
    expect(deserializeEvent(t.sent.at(-1)!)).toEqual({ type: 'update', payload: { index: 2 } });
    a.stop();
  });

  it('Subscription: listeners receive dispatched events; unsubscribe stops them', () => {
    const t = new MockTransport();
    const a = new BrowserAdapter({ transportFactory: () => t });
    a.start();
    const got: ServerEvent[] = [];
    const off = a.subscribe((e) => got.push(e));
    t.emit(serializeEvent({ type: 'update', payload: { x: 1 } }));
    off();
    t.emit(serializeEvent({ type: 'update', payload: { x: 2 } }));
    expect(got).toEqual([{ type: 'update', payload: { x: 1 } }]);
    a.stop();
  });

  it('Heartbeat: emits a heartbeat every heartbeatMs', () => {
    const t = new MockTransport();
    const a = new BrowserAdapter({ transportFactory: () => t, heartbeatMs: 1000 });
    a.start();
    vi.advanceTimersByTime(3000);
    const beats = t.sent.filter((d) => deserializeEvent(d).type === 'heartbeat');
    expect(beats.length).toBe(3);
    a.stop();
  });

  it('Reconnect: creates a new transport after the connection closes', () => {
    let count = 0;
    let current: MockTransport;
    const a = new BrowserAdapter({
      transportFactory: () => {
        count++;
        current = new MockTransport();
        return current;
      },
      reconnectMs: 500,
    });
    a.start();
    expect(count).toBe(1);
    current!.triggerClose();
    vi.advanceTimersByTime(500);
    expect(count).toBe(2); // reconnected via factory
    a.pushSnapshot({ ok: true });
    expect(current!.sent.length).toBe(1); // uses the new transport
    a.stop();
  });

  it('Failure isolation: a throwing transport does not propagate to the caller (Runtime)', () => {
    const t = new MockTransport();
    t.throwOnSend = true;
    const a = new BrowserAdapter({ transportFactory: () => t });
    a.start();
    expect(() => a.pushSnapshot({ any: 1 })).not.toThrow();
    expect(a.pushSnapshot({ any: 1 })).toBe(false);
    a.stop();
  });

  it('WebSocket bridge maps a WebSocket-like object to a transport', () => {
    const ws: WebSocketLike = { send: vi.fn(), close: vi.fn(), onmessage: null, onclose: null };
    const transport = createWebSocketTransport(ws);
    let received = '';
    transport.onMessage((d) => (received = d));
    ws.onmessage!({ data: 'hello' });
    expect(received).toBe('hello');
    transport.send('ping');
    expect(ws.send).toHaveBeenCalledWith('ping');
  });
});
