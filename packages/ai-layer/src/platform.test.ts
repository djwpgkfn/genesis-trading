import { describe, it, expect } from 'vitest';
import { AILayer, type ResearchSink } from './platform.js';
import { isProductionEligible } from './frozen-artifact.js';
import { AI_CAPABILITIES } from './isolation.js';
import type { FrozenArtifact } from './types.js';

describe('AI Layer (advisory, structurally isolated)', () => {
  it('has no execution capability (INV-S3/D3)', () => {
    const ai = new AILayer();
    expect(Object.values(AI_CAPABILITIES).every((v) => v === false)).toBe(true);
    expect((ai as unknown as Record<string, unknown>)['execute']).toBeUndefined();
    expect((ai as unknown as Record<string, unknown>)['placeOrder']).toBeUndefined();
  });

  it('four sub-AIs each produce only their own proposal kind', () => {
    const ai = new AILayer();
    for (const k of ['market-analysis', 'strategy', 'parameter', 'report'] as const) {
      expect(ai.propose(k, ['r1']).kind).toBe(k);
    }
  });

  it('event-sources the proposal lifecycle', () => {
    const ai = new AILayer();
    const p = ai.propose('parameter', ['r1']);
    ai.transition(p.proposal_id, 'candidate');
    ai.transition(p.proposal_id, 'validated');
    ai.transition(p.proposal_id, 'approved');
    const types = ai.eventLog().all().map((e) => e.event_type);
    expect(types).toContain('AI.proposalCreated');
    expect(types).toContain('AI.proposalValidated');
    expect(ai.eventLog().verifyChain()).toBe(true);
    expect(() => ai.transition(p.proposal_id, 'candidate')).toThrow(); // approved→candidate invalid
  });

  it('freezes only validated proposals; artifact carries provenance + hash', () => {
    const ai = new AILayer();
    const p = ai.propose('parameter', ['r1', 'r2']);
    expect(() => ai.freeze(p.proposal_id)).toThrow(); // draft not freezable
    ai.transition(p.proposal_id, 'candidate');
    ai.transition(p.proposal_id, 'validated');
    const a = ai.freeze(p.proposal_id, '1.2.3');
    expect(a.content_hash).toBeTruthy();
    expect(a.provenance.artifact_version).toBe('1.2.3');
    expect(a.provenance.input_refs).toEqual(['r1', 'r2']);
    expect(isProductionEligible(a)).toBe(false); // no approval signature yet (INV-V3)
  });

  it('frozen artifact flows to Research only (no Production path)', () => {
    const ai = new AILayer();
    const p = ai.propose('strategy', ['r1']);
    ai.transition(p.proposal_id, 'candidate');
    ai.transition(p.proposal_id, 'validated');
    const a = ai.freeze(p.proposal_id);
    const received: FrozenArtifact[] = [];
    const research: ResearchSink = { submitArtifact: (x) => received.push(x) };
    ai.submitToResearch(a, research);
    expect(received).toHaveLength(1);
    // AILayer exposes no submitToProduction / deploy method
    expect((ai as unknown as Record<string, unknown>)['submitToProduction']).toBeUndefined();
  });

  it('AI Memory tracks calibration/drift separately from market memory', () => {
    const ai = new AILayer();
    ai.memory.recordOutcome(true, 0.8, 0.9);
    ai.memory.recordOutcome(false, 0.9, 0.2);
    expect(ai.memory.successRate()).toBeCloseTo(0.5, 6);
    expect(ai.memory.calibrationError()).toBeGreaterThan(0);
  });
});
