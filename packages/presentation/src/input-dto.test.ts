import { describe, it, expect } from 'vitest';
import { buildSampleRecording } from '@genesis/replay-engine';
import { presentSession } from './frame-view.js';

const report = { passed: 48, total: 48, failing: [] as string[] };

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe('Presentation Input DTO — immutability (P1)', () => {
  it('presentation DTO is plain and JSON round-trips (no runtime leak)', () => {
    const view = presentSession(buildSampleRecording(2), report);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
  it('DTO is deep-freezable and preserves data', () => {
    const view = presentSession(buildSampleRecording(2), report);
    const before = JSON.stringify(view);
    deepFreeze(view);
    expect(JSON.stringify(view)).toBe(before);
  });
  it('frozen DTO rejects mutation (immutable)', () => {
    'use strict';
    const view = deepFreeze(presentSession(buildSampleRecording(1), report));
    expect(() => {
      (view.frames[0] as { index: number }).index = 999;
    }).toThrow();
  });
});
