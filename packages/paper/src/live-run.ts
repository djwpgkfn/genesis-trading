import { systemNowMs } from '@genesis/contracts';
import {
  UpbitWsTransport,
  WsCollector,
  reconstructCandles,
  type WebSocketLike,
  type WsMessage,
  type RawStore,
  type Trade,
  type Timeframe,
} from '@genesis/data-layer';
import { toSignalCandles } from './candle-bridge.js';
import { runPaperCycle, paperRisk, type PaperCycleResult } from './pipeline.js';
import { PaperPortfolio } from './portfolio.js';

/**
 * I4-7B-3 short LIVE paper run.
 *
 * Connects to the Upbit PUBLIC WebSocket (market data only), reconstructs candles with the existing
 * `reconstructCandles`, bridges them to the Trading Core candle type and drives the SAME paper
 * pipeline used by the deterministic 7B-2b tests.
 *
 * Network boundary — public market data ONLY:
 *   allowed : wss://api.upbit.com/websocket/v1 (public ticker/trade/orderbook)
 *   never   : private WS, REST order endpoints, account endpoints, API credentials
 * This module imports no Upbit REST client, no private transport and no credential source, so an
 * order request is impossible by construction: `real_orders`, `private_connections` and
 * `order_requests` are structurally 0.
 *
 * Bounded by `durationMs` — it always shuts down; there is no unbounded run here. Long-duration
 * paper soak is I9, not this stage.
 */

export const UPBIT_PUBLIC_WS_URL = 'wss://api.upbit.com/websocket/v1';

export interface LiveRunMetrics {
  duration_ms: number;
  ws_connections: number;
  messages_received: number;
  trades_received: number;
  candles_produced: number;
  candles_rejected: number;
  signals: number;
  decisions: number;
  approvals: number;
  rejections: number;
  orders_submitted: number;
  fills: number;
  reconciliations: number;
  reconnects: number;
  stale_events: number;
  parse_errors: number;
  exceptions: number;
  real_orders: number;
  private_connections: number;
  order_requests: number;
  credentials_accessed: number;
  clean_shutdown: boolean;
  paper_portfolio_final_state: { symbol: string; qty: number; notional: number; avg_price: number }[];
}

export interface LiveRunOptions {
  readonly symbol?: string;
  readonly durationMs?: number;
  readonly timeframe?: Timeframe;
  /** Supplies the WebSocket implementation (e.g. () => new WebSocket(UPBIT_PUBLIC_WS_URL)). */
  readonly wsFactory: () => WebSocketLike;
  /** How often to attempt a paper cycle from the candles collected so far. */
  readonly cycleIntervalMs?: number;
  readonly now?: () => number;
}

/** Minimal in-memory RawStore (the collector appends here; we only need the trade stream). */
function memoryStore(sink: (rec: unknown) => void): RawStore {
  return { append: (rec: unknown) => sink(rec) } as unknown as RawStore;
}

/** Parse an Upbit public `trade` message into the data-layer Trade shape. */
export function parseUpbitTrade(data: unknown, seq: number): Trade | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  const type = m['type'] ?? m['ty'];
  if (type !== 'trade') return null;
  const symbol = (m['code'] ?? m['cd']) as string | undefined;
  const price = Number(m['trade_price'] ?? m['tp']);
  const volume = Number(m['trade_volume'] ?? m['tv']);
  const ts = Number(m['trade_timestamp'] ?? m['ttm'] ?? m['timestamp'] ?? m['tms']);
  const ab = (m['ask_bid'] ?? m['ab']) as string | undefined;
  if (!symbol || !Number.isFinite(price) || !Number.isFinite(volume) || !Number.isFinite(ts)) return null;
  return { symbol, event_time_ms: ts, price, volume, side: ab === 'ASK' ? 'ask' : 'bid', seq };
}

/**
 * Run a bounded live paper session. Resolves with metrics after `durationMs`.
 * Simulated execution only — no order can reach a real venue from here.
 */
export async function runLivePaper(opts: LiveRunOptions): Promise<LiveRunMetrics> {
  const symbol = opts.symbol ?? 'KRW-BTC';
  const durationMs = opts.durationMs ?? 60_000;
  const tf: Timeframe = opts.timeframe ?? '1m';
  const cycleIntervalMs = opts.cycleIntervalMs ?? 15_000;
  const now = opts.now ?? systemNowMs;

  const m: LiveRunMetrics = {
    duration_ms: 0, ws_connections: 0, messages_received: 0, trades_received: 0,
    candles_produced: 0, candles_rejected: 0, signals: 0, decisions: 0, approvals: 0,
    rejections: 0, orders_submitted: 0, fills: 0, reconciliations: 0, reconnects: 0,
    stale_events: 0, parse_errors: 0, exceptions: 0,
    real_orders: 0, private_connections: 0, order_requests: 0, credentials_accessed: 0,
    clean_shutdown: false, paper_portfolio_final_state: [],
  };

  const trades: Trade[] = [];
  let seq = 0;
  const started = now();

  const transport = new UpbitWsTransport(opts.wsFactory, now);
  const collector = new WsCollector(
    transport,
    memoryStore(() => {}),
    {
      subscribe: [{ ticket: `paper-${started}` }, { type: 'trade', codes: [symbol] }, { format: 'DEFAULT' }],
      parse: (msg: WsMessage) => {
        m.messages_received += 1;
        let data: unknown = msg.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch { m.parse_errors += 1; return null; }
        } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
          try { data = JSON.parse(Buffer.from(data as ArrayBuffer).toString('utf8')); }
          catch { m.parse_errors += 1; return null; }
        }
        const t = parseUpbitTrade(data, ++seq);
        if (t) { trades.push(t); m.trades_received += 1; }
        return null; // fills/market data are not written to RawStore in this harness
      },
      now,
    },
  );

  const risk = paperRisk();
  const portfolio = new PaperPortfolio();
  let cycleSeq = 0;

  try {
    await collector.start();
    m.ws_connections += 1;

    const deadline = started + durationMs;
    while (now() < deadline) {
      await sleep(Math.min(cycleIntervalMs, Math.max(0, deadline - now())));
      try {
        if (collector.isStale?.()) m.stale_events += 1;
      } catch { /* isStale is optional in some builds */ }

      // trade → candle (existing reconstruction) → bridge → Trading Core candle
      const dlCandles = reconstructCandles(symbol, trades, tf, now());
      const bridged = toSignalCandles(dlCandles);
      m.candles_produced = bridged.candles.length;
      m.candles_rejected = bridged.rejected.length;
      if (bridged.candles.length < 30) continue; // indicators need ~30 closed candles

      try {
        const r: PaperCycleResult = await runPaperCycle(risk, portfolio, {
          candles: bridged.candles,
          symbol,
          requestSeq: ++cycleSeq,
        });
        m.signals += r.signals.length;
        m.decisions += 1;
        if (r.sized.sized === null) continue;
        if (r.approved) m.approvals += 1; else m.rejections += 1;
        if (!r.approved) continue;
        m.orders_submitted += 1;
        m.fills += r.fills.length;
        if (r.reconciled) m.reconciliations += 1;
      } catch (e) {
        m.exceptions += 1;
        console.error('[live-paper] cycle error:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    m.exceptions += 1;
    console.error('[live-paper] fatal:', e instanceof Error ? e.message : e);
  } finally {
    try { await collector.stop(); } catch { /* already closed */ }
    m.clean_shutdown = true;
  }

  m.duration_ms = now() - started;
  m.paper_portfolio_final_state = portfolio.positions().map((p) => ({
    symbol: p.symbol, qty: p.qty, notional: p.notional, avg_price: p.avg_price,
  }));
  return m;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
