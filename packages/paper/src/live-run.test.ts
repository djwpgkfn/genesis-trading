import { describe, it, expect, vi } from 'vitest';
import { parseUpbitTrade, UPBIT_PUBLIC_WS_URL, runLivePaper } from './live-run.js';
import type { WebSocketLike } from '@genesis/data-layer';

/**
 * OFFLINE tests only. The real public-WS run is NOT part of `npm test` — it is executed explicitly
 * via the paper:live script. Here we drive the harness with a fake WebSocketLike so no network is
 * touched, and we assert the safety boundary.
 */

class FakeSocket implements WebSocketLike {
  private handlers: Record<string, ((arg?: unknown) => void)[]> = {};
  sent: string[] = [];
  on(ev: 'open' | 'message' | 'close', cb: (arg?: unknown) => void): void {
    (this.handlers[ev] ??= []).push(cb);
    if (ev === 'open') setTimeout(() => cb(), 0); // open immediately
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    for (const cb of this.handlers['close'] ?? []) cb();
  }
  emit(data: unknown): void {
    for (const cb of this.handlers['message'] ?? []) cb(data);
  }
}

describe('I4-7B-3: Upbit public trade parsing', () => {
  it('parses a DEFAULT-format trade message', () => {
    const t = parseUpbitTrade(
      { type: 'trade', code: 'KRW-BTC', trade_price: 100_000, trade_volume: 0.5, trade_timestamp: 1_700_000_000_000, ask_bid: 'BID' },
      1,
    );
    expect(t).toEqual({ symbol: 'KRW-BTC', event_time_ms: 1_700_000_000_000, price: 100_000, volume: 0.5, side: 'bid', seq: 1 });
  });

  it('parses a SIMPLE-format trade message', () => {
    const t = parseUpbitTrade({ ty: 'trade', cd: 'KRW-BTC', tp: 99_000, tv: 1, ttm: 1_700_000_000_001, ab: 'ASK' }, 2);
    expect(t?.side).toBe('ask');
    expect(t?.price).toBe(99_000);
  });

  it('ignores non-trade messages and malformed payloads', () => {
    expect(parseUpbitTrade({ type: 'ticker', code: 'KRW-BTC' }, 1)).toBeNull();
    expect(parseUpbitTrade({ type: 'trade', code: 'KRW-BTC', trade_price: 'x' }, 1)).toBeNull();
    expect(parseUpbitTrade(null, 1)).toBeNull();
    expect(parseUpbitTrade('garbage', 1)).toBeNull();
  });
});

describe('I4-7B-3: live harness safety boundary (offline, fake socket)', () => {
  it('uses the public market-data endpoint constant only', () => {
    expect(UPBIT_PUBLIC_WS_URL).toBe('wss://api.upbit.com/websocket/v1');
    expect(UPBIT_PUBLIC_WS_URL).not.toContain('private');
  });

  it('runs bounded, shuts down cleanly and never places a real order', async () => {
    const sock = new FakeSocket();
    let t = 0;
    const m = await runLivePaper({
      wsFactory: () => sock,
      durationMs: 30,
      cycleIntervalMs: 10,
      now: () => (t += 10),
    });
    expect(m.clean_shutdown).toBe(true);
    expect(m.ws_connections).toBe(1);
    expect(m.real_orders).toBe(0);
    expect(m.private_connections).toBe(0);
    expect(m.order_requests).toBe(0);
    expect(m.credentials_accessed).toBe(0);
    expect(m.duration_ms).toBeGreaterThan(0);
  });

  it('subscribes to the public trade stream for the requested symbol', async () => {
    const sock = new FakeSocket();
    let t = 0;
    await runLivePaper({ wsFactory: () => sock, durationMs: 20, cycleIntervalMs: 10, symbol: 'KRW-ETH', now: () => (t += 10) });
    const sub = sock.sent.join(' ');
    expect(sub).toContain('trade');
    expect(sub).toContain('KRW-ETH');
    expect(sub).not.toContain('myOrder');
  });

  it('makes no fetch/REST call during a run', async () => {
    const spy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation((() => {
      throw new Error('no REST call allowed in paper live run');
    }) as never);
    const sock = new FakeSocket();
    let t = 0;
    await runLivePaper({ wsFactory: () => sock, durationMs: 20, cycleIntervalMs: 10, now: () => (t += 10) });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
