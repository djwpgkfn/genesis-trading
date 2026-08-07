import { describe, it, expect } from 'vitest';
import { buildSampleRecording } from '@genesis/replay-engine';
import {
  frameView,
  buildSessionView,
  featureView,
  riskView,
  marketHealthView,
  explainabilityDetail,
} from './frame-view.js';
import {
  decisionViewModel,
  signalViewModels,
  strategyViewModel,
  explainabilityViewModel,
} from './viewmodels/index.js';
import { serializeView, deserializeView } from './view-codec.js';

const report = { passed: 48, total: 48, failing: [] as string[] };
const frame = buildSampleRecording(1)[0]!;
const frames = buildSampleRecording(3);

function roundTrip<T>(v: T): T {
  return deserializeView<T>(serializeView(v));
}

describe('P2: extended FrameView + serialize/deserialize codec', () => {
  it('FeatureView reshapes signals+market without computing indicators', () => {
    const v = featureView(frame);
    expect(v.symbol).toBeTruthy();
    expect(v.candle_count).toBeGreaterThan(0);
    expect(Array.isArray(v.features)).toBe(true);
    expect(v.features.every((f) => typeof f.value === 'number')).toBe(true);
  });

  it('RiskView reflects budget/halt state', () => {
    const v = riskView(frame);
    expect(typeof v.budget_available).toBe('number');
    expect(v.status).toBe(v.halted ? 'HALTED' : 'ACTIVE');
  });

  it('MarketHealthView derives data_quality from candle count', () => {
    const v = marketHealthView(frame);
    expect(['OK', 'THIN']).toContain(v.data_quality);
    expect(v.data_quality).toBe(v.candle_count >= 20 ? 'OK' : 'THIN');
  });

  it('serialize/deserialize round-trips every view (INV-E12 behavior)', () => {
    const views = [
      decisionViewModel(frame.decision),
      signalViewModels(frame.signals),
      strategyViewModel(frame.strategy),
      explainabilityViewModel(frame.decision),
      explainabilityDetail(frame, report),
      featureView(frame),
      riskView(frame),
      marketHealthView(frame),
      frameView(frame),
      buildSessionView(frames),
    ];
    for (const v of views) {
      expect(roundTrip(v)).toEqual(v);
    }
  });

  it('all eight design-pack views are produceable from one frame (completeness)', () => {
    const bundle = {
      decision: decisionViewModel(frame.decision),
      signal: signalViewModels(frame.signals),
      feature: featureView(frame),
      explainability: explainabilityDetail(frame, report),
      replaySession: buildSessionView(frames),
      strategy: strategyViewModel(frame.strategy),
      risk: riskView(frame),
      marketHealth: marketHealthView(frame),
    };
    for (const k of [
      'decision',
      'signal',
      'feature',
      'explainability',
      'replaySession',
      'strategy',
      'risk',
      'marketHealth',
    ] as const) {
      expect(bundle[k]).toBeDefined();
    }
    // whole bundle survives serialization (browser boundary)
    expect(roundTrip(bundle)).toEqual(bundle);
  });
});
