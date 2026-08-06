// Feature computation lives in the Feature Store (single source of truth).
// This module only re-exports; the Signal Engine performs NO feature calculation.
export {
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  volatility,
  volumeRatio,
  trendSlope,
  volumeAverage,
  atr,
  vwap,
  clamp01,
  computeIndicators,
  type IndicatorSet,
  type IndicatorCandle,
} from '@genesis/feature-store';
