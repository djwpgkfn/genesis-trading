/**
 * LIVE smoke test — run ONLY in a networked env with credentials:
 *   UPBIT_ACCESS_KEY=... UPBIT_SECRET_KEY=... node --loader ts-node/esm src/live.integration.ts
 * Public calls need no keys; private (accounts) needs valid read-only keys.
 */
import { loadUpbitConfig } from './config.js';
import { UpbitRestClient } from './rest.js';
import { UpbitWsTransport } from './ws.js';

async function main(): Promise<void> {
  const cfg = loadUpbitConfig();
  const rest = new UpbitRestClient(cfg);

  // 1) public candles
  const candles = await rest.getCandles({
    symbol: 'KRW-BTC',
    tf: '1m',
    toMs: Date.now(),
    count: 3,
  });
  console.log(
    `[REST] fetched ${candles.length} KRW-BTC 1m candles; last close=${candles.at(-1)?.close}`,
  );

  // 2) private accounts (requires keys)
  if (cfg.accessKey && cfg.secretKey) {
    const accts = await rest.getAccounts();
    console.log(`[REST/JWT] accounts: ${accts.map((a) => a.currency).join(',')}`);
  } else {
    console.log('[REST/JWT] skipped (no keys)');
  }

  // 3) websocket: subscribe to trades, print first 3
  const ws = new UpbitWsTransport(cfg);
  let n = 0;
  await new Promise<void>(async (resolve) => {
    ws.onMessage((m) => {
      const d = m.data as { code?: string; trade_price?: number };
      if (d.trade_price) console.log(`[WS] ${d.code} trade_price=${d.trade_price}`);
      if (++n >= 3) {
        void ws.close();
        resolve();
      }
    });
    await ws.connect();
    await ws.subscribe(UpbitWsTransport.subscription([{ type: 'trade', codes: ['KRW-BTC'] }]));
  });
  console.log('[LIVE] Upbit REST + JWT + WS smoke test OK');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
