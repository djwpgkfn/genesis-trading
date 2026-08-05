import { TradingCore, DecisionEngine, type Decision } from '@genesis/decision-engine';
import { SignalEngine } from '@genesis/signal-engine';
import { StrategyEngine } from '@genesis/strategy-engine';
import { InMemoryEventStore } from '@genesis/event-engine';
import type { RecordedFrame } from './console-session.js';

/**
 * Recompute a frame's Decision under a FROZEN replay clock (clock fixed to the frame timestamp).
 * No Date.now, no Math.random, no external API — pure re-run of Trading Core. Backs INV-R9.
 */
export function recomputeDecision(frame: RecordedFrame): Decision {
  const tc = new TradingCore(
    new InMemoryEventStore(),
    new SignalEngine(),
    new StrategyEngine(),
    new DecisionEngine(),
    () => new Date(frame.timestamp_ms).toISOString(),
  );
  const r = tc.run(frame.snapshot, frame.risk, frame.portfolio);
  if (!r.decision) throw new Error('recompute produced no decision');
  return r.decision;
}

/** INV-R9: recomputed Decision deep-equals the stored Decision (Replay == Live). */
export function verifyDeterminism(frame: RecordedFrame): boolean {
  return JSON.stringify(recomputeDecision(frame)) === JSON.stringify(frame.decision);
}
