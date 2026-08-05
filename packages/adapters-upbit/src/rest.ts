import type { CandleQuery, RestClient } from '@genesis/data-layer';
import type { Candle, Timeframe } from '@genesis/data-layer';
import { signUpbitJwt, toQueryString, type UpbitKeys } from './jwt.js';
import type { UpbitConfig } from './config.js';

const UNIT: Record<Timeframe, string> = {
  '1m': 'minutes/1', '5m': 'minutes/5', '15m': 'minutes/15',
  '1h': 'minutes/60', '4h': 'minutes/240', '1d': 'days',
};

export function mapCandle(symbol: string, tf: Timeframe, r: Record<string, unknown>): Candle {
  return {
    symbol, tf,
    open_time_ms: Date.parse(String(r['candle_date_time_utc']) + 'Z'.replace('ZZ', 'Z')),
    open: Number(r['opening_price']), high: Number(r['high_price']), low: Number(r['low_price']),
    close: Number(r['trade_price']), volume: Number(r['candle_acc_trade_volume']),
    acc_price: Number(r['candle_acc_trade_price']), source: 'rest',
  };
}

/** Real Upbit REST client. Public candles (no auth) + private endpoints (JWT). */
export class UpbitRestClient implements RestClient {
  constructor(private readonly cfg: UpbitConfig) {}
  private keys(): UpbitKeys { return { accessKey: this.cfg.accessKey, secretKey: this.cfg.secretKey }; }

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    const to = new Date(q.toMs).toISOString();
    const qs = toQueryString({ market: q.symbol, count: q.count, to });
    const url = `${this.cfg.restBase}/v1/candles/${UNIT[q.tf]}?${qs}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Upbit candles ${res.status}: ${await res.text()}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.map((r) => mapCandle(q.symbol, q.tf, r)).sort((a, b) => a.open_time_ms - b.open_time_ms);
  }

  /** Private GET (JWT auth). e.g. /v1/accounts */
  async privateGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const qs = toQueryString(params);
    const jwt = signUpbitJwt(this.keys(), qs);
    const url = qs ? `${this.cfg.restBase}${path}?${qs}` : `${this.cfg.restBase}${path}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Upbit GET ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Private POST (JWT auth). e.g. /v1/orders */
  async privatePost<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const qs = toQueryString(params);
    const jwt = signUpbitJwt(this.keys(), qs);
    const res = await fetch(`${this.cfg.restBase}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Upbit POST ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  getAccounts(): Promise<Array<{ currency: string; balance: string }>> {
    return this.privateGet('/v1/accounts');
  }
}
