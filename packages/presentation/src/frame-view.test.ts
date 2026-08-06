import { describe, it, expect } from 'vitest';
import { buildSampleRecording } from '@genesis/replay-engine';
import {
  frameView,
  buildSessionView,
  dashboardView,
  presentSession,
  explainabilityDetail,
} from './frame-view.js';

const report = { passed: 47, total: 47, failing: [] as string[] };

describe('Runtime → Presentation (S12)', () => {
  it('dashboardView exposes all explainability fields (#5)', () => {
    const f = buildSampleRecording(1)[0]!;
    const d = dashboardView(f, report);
    const e = d.explainability;
    expect(e).toHaveProperty('timestamp');
    expect(e).toHaveProperty('risk_budget');
    expect(e).toHaveProperty('reject_reason');
    expect(e).toHaveProperty('invariant_status');
    expect(e.signals.length).toBeGreaterThan(0);
    expect(e.strategy).toBeTruthy();
    expect(e.decision).toBe(d.decision.action);
    expect(e.invariant_status).toContain('47/47');
  });

  it('reject_reason is set for HOLD/WAIT, null otherwise', () => {
    const f = buildSampleRecording(1)[0]!;
    const e = explainabilityDetail(f, report);
    const rejected = f.decision.action === 'HOLD' || f.decision.action === 'WAIT';
    expect(e.reject_reason === null).toBe(!rejected);
  });

  it('presentSession is a pure, JSON-serializable DTO (browser boundary)', () => {
    const frames = buildSampleRecording(3);
    const view = presentSession(frames, report);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    expect(view.frames).toHaveLength(3);
    expect(view.history).toHaveLength(3);
  });

  it('mapping is read-only (does not mutate the runtime snapshot)', () => {
    const frames = buildSampleRecording(2);
    const before = JSON.stringify(frames);
    buildSessionView(frames);
    presentSession(frames, report);
    expect(JSON.stringify(frames)).toBe(before);
  });

  it('Live and Replay use the same ViewModel (#6): same frames ⇒ same view', () => {
    const frames = buildSampleRecording(2);
    expect(presentSession(frames, report)).toEqual(presentSession(frames, report));
  });

  it('frameView (baseline) still works', () => {
    const f = buildSampleRecording(1)[0]!;
    expect(frameView(f).market.symbol).toBeTruthy();
  });

  it('P1: presentSession output is deeply frozen (DTO immutable)', () => {
    const view = presentSession(buildSampleRecording(2), report);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.frames)).toBe(true);
    expect(Object.isFrozen(view.frames[0])).toBe(true);
    expect(Object.isFrozen(view.frames[0]!.signals)).toBe(true);
  });

  it('P1: mutating a frozen DTO does not change it (immutable)', () => {
    const view = presentSession(buildSampleRecording(1), report);
    const before = view.frames[0]!.decision.action;
    try {
      (view.frames[0]!.decision as { action: string }).action = 'HACKED';
    } catch {
      /* strict mode throws; non-strict silently ignores — both leave value unchanged */
    }
    expect(view.frames[0]!.decision.action).toBe(before);
  });

  it('P1: DTO serialization round-trips (No Runtime Leak)', () => {
    const view = presentSession(buildSampleRecording(3), report);
    const roundTrip = JSON.parse(JSON.stringify(view));
    expect(roundTrip).toEqual(view);
  });
});
