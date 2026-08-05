import type { CandleQuery, RestClient } from './rest-client.js';
import type { Candle, Timeframe } from '../types.js';

const UNIT: Record<Timeframe, string> = {
  '1m': 'minutes/1',
  '5m': 'minutes/5',
  '15m': 'minutes/15',
  '1h': 'minutes/60',
  '4h': 'minutes/240',
  '1d': 'days',
};

/**
 * Upbit REST candle binding (quotation, no auth). Uses `market`, `to`, `count`.
 * `fetchJson` is injected so this stays testable; finalized in a networked env.
 */
export class UpbitRestClient implements RestClient {
  constructor(private readonly fetchJson: (url: string) => Promise<unknown[]>) {}

  async getCandles(q: CandleQuery): Promise<Candle[]> {
    const to = new Date(q.toMs).toISOString();
    const url =
      `https://api.upbit.com/v1/candles/${UNIT[q.tf]}` +
      `?market=${encodeURIComponent(q.symbol)}&count=${q.count}&to=${encodeURIComponent(to)}`;
    const rows = await this.fetchJson(url);
    return rows.map((r) => mapRow(q.symbol, q.tf, r as Record<string, number | string>));
  }
}

function mapRow(symbol: string, tf: Timeframe, r: Record<string, number | string>): Candle {
  return {
    symbol,
    tf,
    open_time_ms: Date.parse(String(r['candle_date_time_utc'])),
    open: Number(r['opening_price']),
    high: Number(r['high_price']),
    low: Number(r['low_price']),
    close: Number(r['trade_price']),
    volume: Number(r['candle_acc_trade_volume']),
    acc_price: Number(r['candle_acc_trade_price']),
    source: 'rest',
  };
}
