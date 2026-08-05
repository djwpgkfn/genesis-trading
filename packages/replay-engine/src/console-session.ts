import type { MarketSnapshot, SignalSet } from '@genesis/signal-engine';
import type { StrategyDecision } from '@genesis/strategy-engine';
import type { Decision, PortfolioSnapshot, RiskSnapshot } from '@genesis/decision-engine';
import { canReplayTransition, type ReplayState } from './replay-state-machine.js';

export type ReplaySpeed = 1 | 2 | 5 | 10;

/** One recorded decision cycle (immutable). Enough to render and to recompute (verify). */
export interface RecordedFrame {
  index: number;
  correlation_id: string;
  timestamp_ms: number;
  snapshot: MarketSnapshot;
  risk: RiskSnapshot;
  portfolio: PortfolioSnapshot;
  signals: SignalSet;
  strategy: StrategyDecision;
  decision: Decision; // stored SSOT
}
export interface ReplayCursor {
  frame_index: number;
  decision_id: string;
}

/**
 * Operator-facing replay session (read-only). Tracks transport state + cursor + speed over an
 * immutable recording. Emits NO trading events and performs NO I/O — navigation only. The UI drives
 * auto-advance timing (speed); this class stays pure and deterministic.
 */
export class OperatorReplaySession {
  private state: ReplayState = 'IDLE';
  private speed: ReplaySpeed = 1;
  private cursor: ReplayCursor;

  constructor(private readonly frames: readonly RecordedFrame[]) {
    this.cursor = { frame_index: 0, decision_id: frames[0]?.decision.id ?? '' };
  }

  // ---- getters ----
  getState(): ReplayState {
    return this.state;
  }
  getSpeed(): ReplaySpeed {
    return this.speed;
  }
  getCursor(): ReplayCursor {
    return { ...this.cursor };
  }
  totalFrames(): number {
    return this.frames.length;
  }
  timeline(): readonly RecordedFrame[] {
    return this.frames;
  }
  currentFrame(): RecordedFrame {
    const f = this.frames[this.cursor.frame_index];
    if (!f) throw new Error('cursor out of range');
    return f;
  }
  restoreSnapshot(): MarketSnapshot {
    return this.currentFrame().snapshot;
  }
  restoreDecision(): Decision {
    return this.currentFrame().decision;
  }

  // ---- transport ----
  load(): this {
    this.transition('LOADED');
    this.setCursor(0);
    return this;
  }
  play(speed?: ReplaySpeed): this {
    if (speed) this.speed = speed;
    this.transition('PLAYING');
    return this;
  }
  pause(): this {
    this.transition('PAUSED');
    return this;
  }
  stop(): this {
    this.transition('STOPPED');
    return this;
  }
  reset(): this {
    this.transition('LOADED');
    this.setCursor(0);
    return this;
  }

  /** Speed is presentation-only; allowed while LOADED/PAUSED/PLAYING (never changes content). */
  setSpeed(speed: ReplaySpeed): this {
    if (this.state === 'IDLE') throw new Error('load() before setSpeed');
    this.speed = speed;
    return this;
  }

  /** Auto-advance one frame (called by the UI timer at speed cadence). */
  advance(): boolean {
    if (this.state !== 'PLAYING')
      throw new Error(`advance only while PLAYING (state=${this.state})`);
    const next = this.cursor.frame_index + 1;
    if (next >= this.frames.length) {
      // already at the last frame — nothing further to advance to.
      this.transition('COMPLETED');
      return false;
    }
    this.setCursor(next);
    if (next >= this.frames.length - 1) {
      // moved onto the last frame → recording is complete.
      this.transition('COMPLETED');
      return false;
    }
    return true;
  }

  // ---- navigation (LOADED/PAUSED only) ----
  seek(frameIndex: number): this {
    this.assertNavigable();
    this.setCursor(frameIndex);
    return this;
  }
  step(delta: 1 | -1): this {
    this.assertNavigable();
    this.setCursor(this.cursor.frame_index + delta);
    return this;
  }
  /** Jump to a specific decision (Decision History Panel click). */
  seekToDecision(decisionId: string): this {
    this.assertNavigable();
    const i = this.frames.findIndex((f) => f.decision.id === decisionId);
    if (i < 0) throw new Error(`decision not found: ${decisionId}`);
    this.setCursor(i);
    return this;
  }

  private assertNavigable(): void {
    if (this.state !== 'LOADED' && this.state !== 'PAUSED') {
      throw new Error(`navigation requires LOADED/PAUSED (state=${this.state})`);
    }
  }
  private setCursor(i: number): void {
    if (i < 0 || i >= this.frames.length) throw new Error(`frame index out of range: ${i}`);
    this.cursor = { frame_index: i, decision_id: this.frames[i]!.decision.id };
  }
  private transition(to: ReplayState): void {
    if (!canReplayTransition(this.state, to))
      throw new Error(`invalid replay transition ${this.state} → ${to}`);
    this.state = to;
  }
}
