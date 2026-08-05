export type SignalName =
  | 'EMA_CROSS'
  | 'MACD_BULLISH'
  | 'MACD_BEARISH'
  | 'RSI_OVERSOLD'
  | 'RSI_OVERBOUGHT'
  | 'BB_BREAKOUT'
  | 'HIGH_VOLUME'
  | 'LOW_VOLUME'
  | 'VOLATILITY_HIGH'
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'ORDERBOOK_IMBALANCE'
  | 'LIQUIDITY_LOW'
  | 'LIQUIDITY_HIGH';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time_ms: number;
}
export interface OrderbookLevel {
  price: number;
  size: number;
}
export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

/** Deterministic input to the Trading Core. Candles are closed (no repaint, INV-T2). */
export interface MarketSnapshot {
  symbol: string;
  timestamp_ms: number;
  candles: Candle[];
  orderbook?: Orderbook;
}

export interface Signal {
  id: string;
  name: SignalName;
  value: number; // signed magnitude/direction
  strength: number; // 0..1
  confidence: number; // 0..1
  timestamp_ms: number;
  source: string[]; // basis feature evidence (non-empty)
}
export type SignalSet = Signal[];
