import { describe, it, expect } from 'vitest';
import { WsCollector } from './ws-collector.js';
import type { WsTransport, WsMessage } from './transport.js';
import { InMemoryRawStore } from '../landing/raw-store.js';
import type { RawRecord } from '../types.js';

class FakeTransport implements WsTransport {
  private msgCb?: (m: WsMessage) => void;
  private closeCb?: () => void;
  connected = 0;
  async connect() {
    this.connected++;
  }
  async subscribe() {}
  onMessage(cb: (m: WsMessage) => void) {
    this.msgCb = cb;
  }
  onClose(cb: () => void) {
    this.closeCb = cb;
  }
  async close() {}
  emit(data: unknown) {
    this.msgCb?.({ data, received_ms: 0 });
  }
  drop() {
    this.closeCb?.();
  }
}

const iso = (ms: number) => new Date(ms).toISOString() as RawRecord['event_time'];

describe('WsCollector', () => {
  it('losslessly persists every parsed message', async () => {
    const store = new InMemoryRawStore();
    const tr = new FakeTransport();
    let clock = 0;
    const col = new WsCollector(tr, store, {
      subscribe: {},
      now: () => clock,
      parse: (m): RawRecord => ({
        kind: 'trade',
        symbol: 'KRW-BTC',
        event_time: iso(m.received_ms),
        ingest_time: iso(m.received_ms),
        event_time_ms: m.received_ms,
        ingest_time_ms: m.received_ms,
        seq: Number(m.data),
        payload: m.data,
      }),
    });
    await col.start();
    for (let i = 1; i <= 5; i++) {
      clock = i;
      tr.emit(i);
    }
    expect(store.count()).toBe(5);
    expect(store.all().map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('flags staleness past heartbeat window', async () => {
    const tr = new FakeTransport();
    let clock = 0;
    const col = new WsCollector(tr, new InMemoryRawStore(), {
      subscribe: {},
      heartbeatMs: 100,
      now: () => clock,
      parse: () => null,
    });
    await col.start();
    clock = 50;
    expect(col.isStale()).toBe(false);
    clock = 200;
    expect(col.isStale()).toBe(true);
  });
});
