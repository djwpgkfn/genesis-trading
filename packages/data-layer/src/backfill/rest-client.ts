import type { Candle, Symbol, Timeframe } from '../types.js';

export interface CandleQuery { symbol: Symbol; tf: Timeframe; toMs: number; count: number }
export interface RestClient {
  /** Fetch up to `count` candles ending at `toMs` (exchange paginates via `to`). */
  getCandles(q: CandleQuery): Promise<Candle[]>;
}

/** Token-bucket throttle to respect exchange rate limits (Upbit quotation ~10 req/s, 600/min). */
export class RateLimiter {
  private tokens: number;
  private lastRefillMs: number;
  constructor(
    private readonly ratePerSec: number,
    private readonly burst: number,
    private readonly now: () => number,
  ) {
    this.tokens = burst;
    this.lastRefillMs = now();
  }
  private refill(): void {
    const t = this.now();
    const elapsed = (t - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSec);
    this.lastRefillMs = t;
  }
  /** ms to wait before a token is available (0 if immediate). Deterministic given `now`. */
  acquireDelayMs(): number {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    const needed = 1 - this.tokens;
    return Math.ceil((needed / this.ratePerSec) * 1000);
  }
}

/** Backfill loop skeleton: pages backward via `toMs` until `fromMs`, honoring the limiter. */
export async function backfillCandles(
  client: RestClient,
  limiter: RateLimiter,
  base: { symbol: Symbol; tf: Timeframe },
  fromMs: number,
  toMs: number,
  sleep: (ms: number) => Promise<void>,
  pageSize = 200,
): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = toMs;
  while (cursor > fromMs) {
    const delay = limiter.acquireDelayMs();
    if (delay > 0) await sleep(delay);
    const page = await client.getCandles({ ...base, toMs: cursor, count: pageSize });
    if (page.length === 0) break;
    out.push(...page);
    const earliest = Math.min(...page.map((c) => c.open_time_ms));
    if (earliest >= cursor) break; // no progress guard
    cursor = earliest;
  }
  return out.filter((c) => c.open_time_ms >= fromMs).sort((a, b) => a.open_time_ms - b.open_time_ms);
}
