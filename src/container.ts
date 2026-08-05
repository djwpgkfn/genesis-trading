// Runtime bootstrap: Config Loader, Clock, DI Container, Upbit connectivity check.
// App/composition layer only — no Contracts or engine/architecture changes.
import { loadUpbitConfig, UpbitRestClient, type UpbitConfig } from '@genesis/adapters-upbit';
import { StructuredLogger } from '@genesis/ops';
import { systemNowMs } from '@genesis/contracts';

/** Injectable clock (keeps wall-clock out of engine code; here it's the process boundary). */
export interface Clock {
  now(): number;
  iso(): string;
}
export const systemClock: Clock = {
  now: systemNowMs,
  iso: () => new Date().toISOString(),
};

export interface AppConfig {
  upbit: UpbitConfig;
}

/** Config Loader: reads env (via dotenv in main) and validates required secrets. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): { config: AppConfig; missing: string[] } {
  const upbit = loadUpbitConfig(env);
  const missing: string[] = [];
  if (!upbit.accessKey) missing.push('UPBIT_ACCESS_KEY');
  if (!upbit.secretKey) missing.push('UPBIT_SECRET_KEY');
  return { config: { upbit }, missing };
}

/** Dependency-injection container: the wired runtime graph. */
export interface Container {
  config: AppConfig;
  logger: StructuredLogger;
  clock: Clock;
  upbitRest: UpbitRestClient;
}

export function buildContainer(
  config: AppConfig,
  logger: StructuredLogger,
  clock: Clock = systemClock,
): Container {
  return { config, logger, clock, upbitRest: new UpbitRestClient(config.upbit) };
}

/** Public connectivity check (no auth). Fatal if it fails — no data feed. */
export async function checkUpbitPublic(c: Container): Promise<void> {
  const candles = await c.upbitRest.getCandles({
    symbol: 'KRW-BTC',
    tf: '1m',
    toMs: c.clock.now(),
    count: 1,
  });
  c.logger.info('upbit public REST OK', {}, { last_close: candles.at(-1)?.close ?? null });
}

/** Private probe (JWT accounts). Best-effort — public streaming does not need it. */
export async function probeUpbitPrivate(c: Container): Promise<boolean> {
  try {
    const accounts = await c.upbitRest.getAccounts();
    c.logger.info('upbit private REST OK (JWT)', {}, { currencies: accounts.map((a) => a.currency) });
    return true;
  } catch (e) {
    c.logger.warn(
      'upbit private REST unavailable — continuing with public stream (check API key IP allowlist)',
      {},
      { error: e instanceof Error ? e.message : String(e) },
    );
    return false;
  }
}
