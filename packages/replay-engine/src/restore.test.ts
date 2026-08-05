import { describe, it, expect } from 'vitest';
import { buildSampleRecording, recomputeDecision, verifyDeterminism } from './index.js';

describe('Deterministic replay (restore + verify)', () => {
  it('recomputes a Decision equal to the stored one (Replay == Live, INV-R9)', () => {
    for (const f of buildSampleRecording(3)) {
      expect(verifyDeterminism(f)).toBe(true);
    }
  });

  it('recompute is itself deterministic (same frame → same Decision)', () => {
    const f = buildSampleRecording(1)[0]!;
    expect(JSON.stringify(recomputeDecision(f))).toBe(JSON.stringify(recomputeDecision(f)));
  });

  it('detects a tampered stored Decision', () => {
    const f = buildSampleRecording(1)[0]!;
    const tampered = {
      ...f,
      decision: { ...f.decision, action: 'SELL' as const, confidence: 0.01 },
    };
    expect(verifyDeterminism(tampered)).toBe(false);
  });
});
