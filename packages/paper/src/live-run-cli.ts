/**
 * I4-7B-3 CLI: short live paper run against the Upbit PUBLIC WebSocket.
 *
 *   node dist/... (see package.json "paper:live")
 *   arguments: [symbol] [durationSeconds]
 *
 * Market data only. No credentials are read, no REST/private endpoint is contacted, and execution
 * is simulated end to end. The run is bounded by the duration and always shuts down.
 */
import { WebSocket } from 'ws';
import { runLivePaper, UPBIT_PUBLIC_WS_URL } from './live-run.js';
import type { WebSocketLike } from '@genesis/data-layer';

/** Adapt the `ws` client to the WebSocketLike shape the transport expects. */
function wsFactory(): WebSocketLike {
  const sock = new WebSocket(UPBIT_PUBLIC_WS_URL);
  return {
    on(ev, cb) {
      if (ev === 'open') sock.on('open', () => cb());
      else if (ev === 'message') sock.on('message', (d: unknown) => cb(d));
      else sock.on('close', () => cb());
    },
    send(data: string) {
      sock.send(data);
    },
    close() {
      sock.close();
    },
  };
}

async function main(): Promise<void> {
  const symbol = process.argv[2] ?? 'KRW-BTC';
  const seconds = Number(process.argv[3] ?? '60');
  const durationMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000;
  console.log(`[paper:live] symbol=${symbol} duration=${durationMs}ms endpoint=${UPBIT_PUBLIC_WS_URL}`);
  const m = await runLivePaper({ symbol, durationMs, wsFactory });
  console.log(JSON.stringify(m, null, 2));
  const failed =
    m.real_orders !== 0 ||
    m.private_connections !== 0 ||
    m.order_requests !== 0 ||
    m.credentials_accessed !== 0 ||
    !m.clean_shutdown;
  console.log(
    `[paper:live] messages=${m.messages_received} trades=${m.trades_received} candles=${m.candles_produced} ` +
      `decisions=${m.decisions} orders=${m.orders_submitted} real_orders=${m.real_orders} exceptions=${m.exceptions}`,
  );
  process.exit(failed ? 1 : 0);
}

void main();
