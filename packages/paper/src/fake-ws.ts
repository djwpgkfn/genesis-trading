import type { WsTransport, WsMessage } from '@genesis/data-layer';
import type { Candle } from '@genesis/signal-engine';

/**
 * I4-7B-2b deterministic fake WebSocket transport.
 *
 * Implements the EXISTING `WsTransport` interface (the same one UpbitWsTransport implements), so the
 * paper pipeline uses the real transport abstraction rather than a parallel market-data framework.
 * It never opens a socket and never touches the network.
 *
 * Note on scope: the production candle path is trade-tick reconstruction (data-layer
 * `reconstructCandles`), which produces the data-layer `Candle` type (symbol/tf/open_time_ms/…).
 * The SignalEngine consumes a different, minimal `Candle` (open/high/low/close/volume/time_ms) via
 * `MarketSnapshot`. For 7B-2b the fixture emits signal-engine candles directly through this
 * transport, so the pipeline under test is Decision→Execution rather than tick reconstruction.
 * Wiring trade→candle reconstruction into the paper feed is left to 7B-3 (real public WS).
 */
export class FakeWsTransport implements WsTransport {
  private msgCb: ((m: WsMessage) => void) | null = null;
  private closeCb: (() => void) | null = null;
  connectCount = 0;
  subscribeCount = 0;
  closed = false;

  async connect(): Promise<void> {
    this.connectCount += 1;
  }
  async subscribe(): Promise<void> {
    this.subscribeCount += 1;
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

  /** Push one deterministic candle message to the subscriber. */
  emitCandle(candle: Candle): void {
    this.msgCb?.({ data: { kind: 'candle', candle }, received_ms: candle.time_ms });
  }

  /** Push a whole series, in order. */
  emitSeries(candles: readonly Candle[]): void {
    for (const c of candles) this.emitCandle(c);
  }

  /** Simulate a disconnect. */
  drop(): void {
    this.closeCb?.();
  }
}
