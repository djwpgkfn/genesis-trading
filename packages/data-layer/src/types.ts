// S1 Data Layer domain types. (MarketData payloads live here for S1; promotion to
// @genesis/contracts is an S3 task when the full event taxonomy is enumerated — see TODO.)
import type { ISOTimestamp } from '@genesis/contracts';

export type Symbol = string; // e.g. 'KRW-BTC'
export type Side = 'ask' | 'bid';

/** Supported candle timeframes (ms). */
export const TF = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
} as const;
export type Timeframe = keyof typeof TF;

export interface Trade {
  symbol: Symbol;
  event_time_ms: number; // exchange time (epoch ms)
  price: number;
  volume: number;
  side: Side;
  seq: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}
export interface OrderbookSnapshot {
  symbol: Symbol;
  event_time_ms: number;
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  seq: number;
}

export interface Ticker {
  symbol: Symbol;
  event_time_ms: number;
  trade_price: number;
  seq: number;
}

export interface Candle {
  symbol: Symbol;
  tf: Timeframe;
  open_time_ms: number; // window start (inclusive)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  acc_price: number; // sum(price*volume)
  source: 'reconstructed' | 'rest';
}

export type MarketDataKind = 'trade' | 'orderbook' | 'ticker' | 'candle';

/** Raw record as landed (bitemporal): carries both exchange time and ingest time. */
export interface RawRecord<T = unknown> {
  kind: MarketDataKind;
  symbol: Symbol;
  event_time: ISOTimestamp; // exchange time
  ingest_time: ISOTimestamp; // capture time
  event_time_ms: number;
  ingest_time_ms: number;
  seq: number;
  payload: T;
}
