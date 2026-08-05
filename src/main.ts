// Executable entry point. Run: `npm start` (after `npm run build`) or `npm run dev`.
import 'dotenv/config';
import { StructuredLogger } from '@genesis/ops';
import { InMemoryRawStore, type RawStore } from '@genesis/data-layer';
import { BufferedRawStore, ClickHouseRawStore } from '@genesis/adapters-db';
import { buildContainer, checkUpbitPublic, probeUpbitPrivate, loadConfig, systemClock } from './container.js';
import { WebSocketCollector } from './collector.js';

/** Choose the Raw Store: durable ClickHouse (write-behind) if configured, else in-memory. */
function buildRawStore(logger: StructuredLogger): { store: RawStore; flush: () => Promise<void> } {
  const url = process.env['CLICKHOUSE_URL'];
  if (url) {
    const buffered = new BufferedRawStore(new ClickHouseRawStore(url), (e) =>
      logger.warn('raw flush failed (will retry)', {}, { error: e instanceof Error ? e.message : String(e) }),
    );
    logger.info('raw store: ClickHouse write-behind', {}, { url });
    return { store: buffered, flush: () => buffered.flush() };
  }
  logger.info('raw store: in-memory (set CLICKHOUSE_URL to persist)');
  return { store: new InMemoryRawStore(), flush: async () => {} };
}

async function main(): Promise<void> {
  const logger = new StructuredLogger().child({ trace_id: `boot-${systemClock.now()}` });
  logger.info('genesis bootstrap starting');

  const { config, missing } = loadConfig();
  if (missing.length > 0) {
    logger.error('missing required environment variables (set them in .env)', {}, { missing });
    process.exit(1);
  }

  const container = buildContainer(config, logger, systemClock);

  try {
    await checkUpbitPublic(container);
  } catch (e) {
    logger.error('upbit public REST unreachable', {}, { error: e instanceof Error ? e.message : String(e) });
    process.exit(1);
  }
  await probeUpbitPrivate(container);

  // Real-time collection → Raw Store (ClickHouse if configured, else in-memory).
  const { store: rawStore, flush } = buildRawStore(logger);
  const collector = new WebSocketCollector(
    config.upbit,
    logger,
    systemClock,
    { codes: ['KRW-BTC'] },
    undefined,
    rawStore,
  );

  const flushTimer = setInterval(() => void flush(), 2_000); // write-behind flush
  if (typeof flushTimer.unref === 'function') flushTimer.unref();

  const shutdown = async (signal: string): Promise<void> => {
    clearInterval(flushTimer);
    await flush();
    logger.info('shutting down collector', {}, { signal, raw_records: rawStore.count() });
    await collector.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await collector.start();
  logger.info('collector streaming ticker+trade → raw store', {}, { codes: ['KRW-BTC'] });
}

void main();
