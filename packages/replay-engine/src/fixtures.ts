import { TradingCore, type PortfolioSnapshot, type RiskSnapshot } from '@genesis/decision-engine';
import { SignalEngine, type MarketSnapshot } from '@genesis/signal-engine';
import { StrategyEngine } from '@genesis/strategy-engine';
import { DecisionEngine } from '@genesis/decision-engine';
import { InMemoryEventStore } from '@genesis/event-engine';
import type { RecordedFrame } from './console-session.js';

function uptrendSnapshot(k: number): MarketSnapshot {
  const base = 100 + k * 5;
  const candles = Array.from({ length: 40 }, (_, i) => {
    const close = base + i * 1.5;
    return { open: close - 1, high: close + 1, low: close - 1, close, volume: 10 + (i % 4) * 5, time_ms: (k * 40 + i) * 60000 };
  });
  return { symbol: 'KRW-BTC', timestamp_ms: (k * 40 + 40) * 60000, candles };
}

/** Build a deterministic recording by running Trading Core under a frozen clock per frame. */
export function buildSampleRecording(frameCount = 3): RecordedFrame[] {
  const risk: RiskSnapshot = { budget_available: 1000, halted: false };
  const portfolio: PortfolioSnapshot = { exposure: 0, max_exposure: 1000 };
  const frames: RecordedFrame[] = [];
  for (let k = 0; k < frameCount; k++) {
    const snapshot = uptrendSnapshot(k);
    const tc = new TradingCore(
      new InMemoryEventStore(),
      new SignalEngine(),
      new StrategyEngine(),
      new DecisionEngine(),
      () => new Date(snapshot.timestamp_ms).toISOString(),
    );
    const r = tc.run(snapshot, risk, portfolio);
    if (!r.decision) throw new Error('fixture snapshot produced no decision');
    frames.push({
      index: k,
      correlation_id: `tc-${snapshot.timestamp_ms}`,
      timestamp_ms: snapshot.timestamp_ms,
      snapshot,
      risk,
      portfolio,
      signals: r.signals,
      strategy: r.strategy,
      decision: r.decision,
    });
  }
  return frames;
}
