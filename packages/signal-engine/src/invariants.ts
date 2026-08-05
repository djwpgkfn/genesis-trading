import type { CheckResult } from '@genesis/invariant-runner';
import { SignalEngine } from './engine.js';
import type { MarketSnapshot } from './types.js';

function sampleSnapshot(): MarketSnapshot {
  const candles = Array.from({ length: 40 }, (_, i) => {
    const close = 100 + Math.sin(i / 3) * 5 + i * 0.5;
    return { open: close - 0.5, high: close + 1, low: close - 1, close, volume: 10 + (i % 5) * 3, time_ms: i * 60000 };
  });
  return { symbol: 'KRW-BTC', timestamp_ms: 40 * 60000, candles, orderbook: { bids: [{ price: 99, size: 60 }], asks: [{ price: 101, size: 40 }] } };
}

/** INV-TC1: every Signal has confidence & strength in [0,1] and non-empty basis (source). */
function checkTC1(): CheckResult {
  const signals = new SignalEngine().generate(sampleSnapshot());
  const ok =
    signals.length > 0 &&
    signals.every(
      (s) =>
        s.confidence >= 0 && s.confidence <= 1 && s.strength >= 0 && s.strength <= 1 && s.source.length > 0,
    );
  return ok ? { id: 'INV-TC1', status: 'pass' } : { id: 'INV-TC1', status: 'fail', detail: 'signal confidence/strength/source invalid' };
}

export const signalChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [{ id: 'INV-TC1', fn: checkTC1 }];
