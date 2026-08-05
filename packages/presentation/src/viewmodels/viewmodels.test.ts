import { describe, it, expect } from 'vitest';
import {
  decisionViewModel,
  signalViewModel,
  strategyViewModel,
  explainabilityViewModel,
  invariantViewModel,
  replayViewModel,
  decisionHistory,
} from './index.js';
import { OperatorReplaySession, buildSampleRecording } from '@genesis/replay-engine';
import type { Decision } from '@genesis/decision-engine';
import type { Signal } from '@genesis/signal-engine';
import type { StrategyDecision } from '@genesis/strategy-engine';

const decision: Decision = {
  id: 'decision-1',
  symbol: 'KRW-BTC',
  action: 'BUY',
  confidence: 0.72,
  reason: 'bullish',
  strategy_used: 'momentum',
  signal_used: ['TREND_UP'],
  expected_risk: 0.4,
  expected_reward: 0.8,
  timestamp_ms: 1,
  trace: {
    action: 'BUY',
    strategy: 'momentum',
    signals: ['TREND_UP'],
    features: ['ema9'],
    confidence: 0.72,
    steps: [
      { stage: 'decision', detail: 'BUY', refs: ['r'] },
      { stage: 'confidence', detail: '72%', refs: [] },
    ],
  },
};
const signal: Signal = {
  id: 'TREND_UP@1',
  name: 'TREND_UP',
  value: 1,
  strength: 0.8,
  confidence: 0.9,
  timestamp_ms: 1,
  source: ['slope'],
};
const strategy: StrategyDecision = {
  active: 'momentum',
  selected: ['momentum'],
  scores: [{ name: 'momentum', score: 1.5, confidence: 0.8, reason: ['TREND_UP'] }],
};

describe('Presentation ViewModels (pure mapping)', () => {
  it('DecisionViewModel maps fields for display without business logic', () => {
    const vm = decisionViewModel(decision);
    expect(vm.action).toBe('BUY');
    expect(vm.confidence_pct).toBe('72%');
    expect(vm.rr_ratio).toBe('2.00');
    expect(vm.action_color).toBe('green');
    expect(vm.position_size_display).toContain('I4');
  });
  it('rr_ratio guards divide-by-zero', () => {
    expect(decisionViewModel({ ...decision, expected_risk: 0 }).rr_ratio).toBe('—');
  });
  it('SignalViewModel derives direction from value sign', () => {
    expect(signalViewModel(signal).direction).toBe('BUY');
    expect(signalViewModel({ ...signal, value: -1 }).direction).toBe('SELL');
  });
  it('StrategyViewModel formats scores without re-scoring', () => {
    const vm = strategyViewModel(strategy);
    expect(vm.active).toBe('momentum');
    expect(vm.scores[0]!.score).toBe('1.50');
  });
  it('ExplainabilityViewModel maps the trace chain in order', () => {
    expect(explainabilityViewModel(decision).chain.map((s) => s.stage)).toEqual([
      'decision',
      'confidence',
    ]);
  });
  it('InvariantViewModel reflects report status', () => {
    expect(invariantViewModel({ passed: 45, total: 45, failing: [] }).status).toBe('GREEN');
    expect(invariantViewModel({ passed: 44, total: 45, failing: ['INV-X'] }).status).toBe('RED');
  });

  it('mapping is deterministic (same input ⇒ deep-equal output)', () => {
    expect(decisionViewModel(decision)).toEqual(decisionViewModel(decision));
    expect(signalViewModel(signal)).toEqual(signalViewModel(signal));
  });

  it('ReplayViewModel.history maps recorded frames time-ordered', () => {
    const session = new OperatorReplaySession(buildSampleRecording(3)).load();
    const vm = replayViewModel(session);
    expect(vm.total_frames).toBe(3);
    expect(vm.history).toHaveLength(3);
    expect(vm.history[0]).toHaveProperty('decision_id');
    expect(vm.history[0]).toHaveProperty('action');
    expect(vm.history.map((h) => h.frame_index)).toEqual([0, 1, 2]);
  });
  it('decisionHistory is a pure mapper', () => {
    const frames = buildSampleRecording(2);
    expect(decisionHistory(frames)).toEqual(decisionHistory(frames));
  });
});
