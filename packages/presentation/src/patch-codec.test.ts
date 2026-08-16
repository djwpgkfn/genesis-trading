import { describe, it, expect } from 'vitest';
import { buildSampleRecording } from '@genesis/replay-engine';
import { presentSession, dashboardView } from './frame-view.js';
import { decisionHistory } from './viewmodels/index.js';
import { applyPatch, applyPatches, type PresentationPatch } from './patch-codec.js';

const report = { passed: 49, total: 49, failing: [] as string[] };

describe('I2-3: Incremental Patch codec', () => {
  it('append-frame patch grows the snapshot immutably', () => {
    const frames = buildSampleRecording(2);
    const base = presentSession(frames.slice(0, 1), report);
    const patch: PresentationPatch = {
      op: 'append-frame',
      frame: dashboardView(frames[1]!, report),
      history: decisionHistory([frames[1]!])[0]!,
    };
    const next = applyPatch(base, patch);
    expect(next.frames.length).toBe(2);
    expect(Object.isFrozen(next)).toBe(true);
    expect(base.frames.length).toBe(1); // original untouched
  });

  it('Snapshot + Σpatch == Full Snapshot (consistency, Replay == Live)', () => {
    const frames = buildSampleRecording(5);
    const full = presentSession(frames, report);
    const base = presentSession(frames.slice(0, 1), report);
    const patches: PresentationPatch[] = frames.slice(1).map((f) => ({
      op: 'append-frame',
      frame: dashboardView(f, report),
      history: decisionHistory([f])[0]!,
    }));
    expect(applyPatches(base, patches)).toEqual(full);
  });

  it('reset patch replaces the whole snapshot', () => {
    const frames = buildSampleRecording(3);
    const full = presentSession(frames, report);
    const reset = applyPatch(presentSession(frames.slice(0, 1), report), {
      op: 'reset',
      session: full,
    });
    expect(reset).toEqual(full);
  });
});
