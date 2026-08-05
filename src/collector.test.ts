import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StructuredLogger, type LogEntry } from '@genesis/ops';
import type { WsMessage } from '@genesis/data-layer';
import { InMemoryRawStore } from '@genesis/data-layer';
import { WebSocketCollector, type StreamTransport } from './collector.js';

class FakeTransport implements StreamTransport {
  connectCount = 0;
  subscribed: unknown = null;
  pings = 0;
  closed = false;
  failConnect = false;
  private msgCb: ((m: WsMessage) => void) | null = null;
  private closeCb: (() => void) | null = null;
  async connect(): Promise<void> {
    this.connectCount += 1;
    if (this.failConnect) throw new Error('connect failed');
  }
  async subscribe(p: unknown): Promise<void> {
    this.subscribed = p;
  }
  onMessage(cb: (m: WsMessage) => void): void {
    this.msgCb = cb;
  }
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
  async close(): Promise<void> {
    this.closed = true;
  }
  async ping(): Promise<void> {
    this.pings += 1;
  }
  emit(data: unknown, received_ms = 111): void {
    this.msgCb?.({ data, received_ms });
  }
  fireClose(): void {
    this.closeCb?.();
  }
}

describe('WebSocketCollector', () => {
  const clock = { now: () => 1000, iso: () => '2026-07-28T00:00:00.000Z' };
  let entries: LogEntry[];
  let logger: StructuredLogger;
  let fake: FakeTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    entries = [];
    logger = new StructuredLogger(
      (e) => entries.push(e),
      () => clock.iso(),
    );
    fake = new FakeTransport();
  });
  afterEach(() => vi.useRealTimers());

  function make(opts = {}, store?: InMemoryRawStore) {
    return new WebSocketCollector(
      { accessKey: '', secretKey: '', restBase: '', wsUrl: '' },
      logger,
      clock,
      { heartbeatMs: 1000, initialBackoffMs: 1000, maxBackoffMs: 8000, ...opts },
      () => fake,
      store,
    );
  }
  const reconnectDelays = () =>
    entries
      .filter((e) => e.message === 'ws reconnect scheduled')
      .map((e) => e.fields?.['delay_ms']);

  it('connects and subscribes to ticker + trade for KRW-BTC', async () => {
    await make().start();
    expect(fake.connectCount).toBe(1);
    const sub = fake.subscribed as unknown[];
    expect(sub).toContainEqual({ type: 'ticker', codes: ['KRW-BTC'] });
    expect(sub).toContainEqual({ type: 'trade', codes: ['KRW-BTC'] });
  });

  it('logs each ws event as structured JSON', async () => {
    await make().start();
    fake.emit({ type: 'trade', code: 'KRW-BTC', trade_price: 42 });
    const ev = entries.find((e) => e.message === 'ws event');
    expect(ev?.fields).toMatchObject({ stream: 'trade', code: 'KRW-BTC', trade_price: 42 });
  });

  it('heartbeats via ping on the configured interval', async () => {
    await make({ heartbeatMs: 1000 }).start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fake.pings).toBeGreaterThanOrEqual(3);
  });

  it('applies exponential backoff on consecutive connect failures', async () => {
    fake.failConnect = true;
    await make({ initialBackoffMs: 1000, maxBackoffMs: 8000 }).start(); // fail → schedule 1000
    expect(reconnectDelays()).toEqual([1000]);
    await vi.advanceTimersByTimeAsync(1000); // fail → schedule 2000
    expect(reconnectDelays()).toEqual([1000, 2000]);
    await vi.advanceTimersByTimeAsync(2000); // fail → schedule 4000
    expect(reconnectDelays()).toEqual([1000, 2000, 4000]);
    await vi.advanceTimersByTimeAsync(4000); // fail → schedule 8000 (cap)
    expect(reconnectDelays()).toEqual([1000, 2000, 4000, 8000]);
  });

  it('resets backoff after a successful reconnect', async () => {
    await make({ initialBackoffMs: 1000, maxBackoffMs: 8000 }).start(); // success
    fake.fireClose(); // schedule 1000, backoff → 2000
    await vi.advanceTimersByTimeAsync(1000); // reconnect success → backoff reset to 1000
    expect(fake.connectCount).toBe(2);
    fake.fireClose(); // schedule 1000 again (reset confirmed)
    expect(reconnectDelays()).toEqual([1000, 1000]);
  });

  it('does not reconnect after stop()', async () => {
    const c = make();
    await c.start();
    await c.stop();
    fake.fireClose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.connectCount).toBe(1);
    expect(fake.closed).toBe(true);
  });

  it('persists ticker and trade events to the raw store (append-only)', async () => {
    const store = new InMemoryRawStore();
    const c = make({}, store);
    await c.start();
    fake.emit({ type: 'ticker', code: 'KRW-BTC', trade_price: 100, timestamp: 111 });
    fake.emit({ type: 'trade', code: 'KRW-BTC', trade_price: 101, trade_timestamp: 222 });
    fake.emit({ type: 'orderbook', code: 'KRW-BTC' }); // ignored (not ticker/trade)
    expect(store.count()).toBe(2);
    expect(c.storedCount()).toBe(2);
    const recs = store.all();
    expect(recs[0]).toMatchObject({
      kind: 'ticker',
      symbol: 'KRW-BTC',
      event_time_ms: 111,
      seq: 0,
    });
    expect(recs[1]).toMatchObject({ kind: 'trade', symbol: 'KRW-BTC', event_time_ms: 222, seq: 1 });
  });
});
