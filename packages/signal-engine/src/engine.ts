import type { MarketSnapshot, Signal, SignalName, SignalSet } from './types.js';
import { ema, rsi, macd, bollinger, volatility, volumeRatio, trendSlope, clamp01 } from './features.js';

/** Build a Signal with enforced invariants: confidence/strength in [0,1], non-empty source (INV-TC1). */
function signal(
  name: SignalName,
  value: number,
  strength: number,
  confidence: number,
  timestamp_ms: number,
  source: string[],
): Signal {
  if (source.length === 0) throw new Error(`Signal ${name} requires basis features (source)`);
  return {
    id: `${name}@${timestamp_ms}`,
    name,
    value,
    strength: clamp01(strength),
    confidence: clamp01(confidence),
    timestamp_ms,
    source,
  };
}

/** Signal Engine: Market Snapshot → Features → Signal Set. Pure & deterministic. */
export class SignalEngine {
  generate(snap: MarketSnapshot): SignalSet {
    const out: Signal[] = [];
    const t = snap.timestamp_ms;
    const closes = snap.candles.map((c) => c.close);
    const volumes = snap.candles.map((c) => c.volume);
    const last = closes[closes.length - 1] ?? 0;

    // EMA cross (short vs long)
    const eShort = ema(closes, 9);
    const eLong = ema(closes, 21);
    if (eShort !== null && eLong !== null) {
      const diff = eShort - eLong;
      const strength = clamp01(Math.abs(diff) / (last || 1));
      out.push(signal('EMA_CROSS', Math.sign(diff), strength, clamp01(0.5 + strength), t, [`ema9=${eShort.toFixed(2)}`, `ema21=${eLong.toFixed(2)}`]));
    }

    // MACD
    const m = macd(closes);
    if (m !== null) {
      const strength = clamp01(Math.abs(m.hist) / (last || 1) * 100);
      if (m.hist >= 0) out.push(signal('MACD_BULLISH', 1, strength, clamp01(0.55 + strength), t, [`macd=${m.macd.toFixed(3)}`, `signal=${m.signal.toFixed(3)}`]));
      else out.push(signal('MACD_BEARISH', -1, strength, clamp01(0.55 + strength), t, [`macd=${m.macd.toFixed(3)}`, `signal=${m.signal.toFixed(3)}`]));
    }

    // RSI
    const r = rsi(closes);
    if (r !== null) {
      if (r < 30) out.push(signal('RSI_OVERSOLD', 1, clamp01((30 - r) / 30), clamp01(0.6 + (30 - r) / 60), t, [`rsi=${r.toFixed(1)}`]));
      else if (r > 70) out.push(signal('RSI_OVERBOUGHT', -1, clamp01((r - 70) / 30), clamp01(0.6 + (r - 70) / 60), t, [`rsi=${r.toFixed(1)}`]));
    }

    // Bollinger breakout
    const bb = bollinger(closes);
    if (bb !== null) {
      if (last > bb.upper) out.push(signal('BB_BREAKOUT', 1, clamp01((last - bb.upper) / (last || 1)), 0.6, t, [`close=${last.toFixed(2)}`, `upper=${bb.upper.toFixed(2)}`]));
      else if (last < bb.lower) out.push(signal('BB_BREAKOUT', -1, clamp01((bb.lower - last) / (last || 1)), 0.6, t, [`close=${last.toFixed(2)}`, `lower=${bb.lower.toFixed(2)}`]));
    }

    // Volume
    const vr = volumeRatio(volumes);
    if (vr !== null) {
      if (vr > 1.5) out.push(signal('HIGH_VOLUME', 1, clamp01((vr - 1) / 2), clamp01(0.5 + (vr - 1.5) / 3), t, [`vol_ratio=${vr.toFixed(2)}`]));
      else if (vr < 0.5) out.push(signal('LOW_VOLUME', -1, clamp01((1 - vr)), 0.5, t, [`vol_ratio=${vr.toFixed(2)}`]));
    }

    // Volatility
    const vol = volatility(closes);
    if (vol !== null && vol > 0.02) out.push(signal('VOLATILITY_HIGH', 1, clamp01(vol * 10), clamp01(0.5 + vol * 5), t, [`volatility=${vol.toFixed(4)}`]));

    // Trend
    const slope = trendSlope(closes);
    if (slope !== null) {
      const strength = clamp01(Math.abs(slope) / (last || 1) * 20);
      if (slope > 0) out.push(signal('TREND_UP', 1, strength, clamp01(0.5 + strength), t, [`slope=${slope.toFixed(4)}`]));
      else if (slope < 0) out.push(signal('TREND_DOWN', -1, strength, clamp01(0.5 + strength), t, [`slope=${slope.toFixed(4)}`]));
    }

    // Orderbook imbalance & liquidity
    if (snap.orderbook) {
      const bid = snap.orderbook.bids.reduce((a, l) => a + l.size, 0);
      const ask = snap.orderbook.asks.reduce((a, l) => a + l.size, 0);
      const total = bid + ask;
      if (total > 0) {
        const imb = (bid - ask) / total;
        if (Math.abs(imb) > 0.1) out.push(signal('ORDERBOOK_IMBALANCE', Math.sign(imb), clamp01(Math.abs(imb)), clamp01(0.5 + Math.abs(imb) / 2), t, [`bid=${bid}`, `ask=${ask}`]));
        if (total < 1) out.push(signal('LIQUIDITY_LOW', -1, clamp01(1 - total), 0.5, t, [`depth=${total.toFixed(3)}`]));
        else if (total > 100) out.push(signal('LIQUIDITY_HIGH', 1, clamp01(total / 1000), 0.5, t, [`depth=${total.toFixed(1)}`]));
      }
    }

    return out;
  }
}
