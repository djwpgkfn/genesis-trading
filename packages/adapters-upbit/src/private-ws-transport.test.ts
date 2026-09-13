import { describe, it, expect } from 'vitest';
import { UpbitPrivateWsTransport } from './private-ws-transport.js';
import { MyOrderFillBuffer, type UpbitMyOrderMessage } from './my-order.js';
import { WsCollector, type WsTransport, type WsMessage } from '@genesis/data-layer';

// Fake transport implementing the SAME WsTransport interface — no real socket, no auth, no network.
class FakeTransport implements WsTransport {
  private msgCb: ((m: WsMessage) => void) | null = null;
  private closeCb: (() => void) | null = null;
  connected = 0;
  async connect(): Promise<void> { this.connected++; }
  async subscribe(): Promise<void> {}
  onMessage(cb: (m: WsMessage) => void): void { this.msgCb = cb; }
  onClose(cb: () => void): void { this.closeCb = cb; }
  async close(): Promise<void> {}
  emit(data: unknown): void { this.msgCb?.({ data, received_ms: 0 }); }
  drop(): void { this.closeCb?.(); }
}

describe('I4-5: private WS subscription + collector wiring (fake transport, no network)', () => {
  it('subscription builds a myOrder request', () => {
    const sub = UpbitPrivateWsTransport.subscription() as Array<Record<string, unknown>>;
    expect(sub.some((s) => s['type'] === 'myOrder')).toBe(true);
  });

  it('collector delivers myOrder messages into a FillEvent buffer (WS → FillEvent path)', async () => {
    const transport = new FakeTransport();
    const buf = new MyOrderFillBuffer();
    // Use the collector only for lifecycle; route parsed fills into the buffer via parse callback.
    const store = { append: () => {} } as unknown as import('@genesis/data-layer').RawStore;
    const collector = new WsCollector(transport, store, {
      subscribe: UpbitPrivateWsTransport.subscription(),
      parse: (m: WsMessage) => { buf.ingest(m.data as UpbitMyOrderMessage); return null; }, // fills go to buffer, not RawStore
      now: () => 0,
    });
    await collector.start();
    expect(transport.connected).toBe(1);

    transport.emit({ type: 'myOrder', uuid: 'o1', identifier: 'c1', trade_uuid: 't1', executed_funds: 40_000, executed_volume: 0.4, avg_price: 100_000, paid_fee: 20, trades_count: 1, trade_timestamp: 1 });
    expect(buf.filledNotional('c1')).toBe(40_000);

    // disconnect + redelivery of same trade → no double count
    transport.drop();
    transport.emit({ type: 'myOrder', uuid: 'o1', identifier: 'c1', trade_uuid: 't1', executed_funds: 40_000, executed_volume: 0.4, avg_price: 100_000, paid_fee: 20, trades_count: 1, trade_timestamp: 1 });
    expect(buf.filledNotional('c1')).toBe(40_000); // deduped by trade_uuid

    await collector.stop();
  });
});
