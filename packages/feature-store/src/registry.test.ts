import { describe, it, expect } from 'vitest';
import { FeatureDefinitionRegistry } from './registry.js';
import { closeFeature } from './features.samples.js';

describe('registry immutability (INV-V1)', () => {
  it('rejects re-registering the same id@version', () => {
    const reg = new FeatureDefinitionRegistry();
    reg.register(closeFeature);
    expect(() => reg.register(closeFeature)).toThrow(/immutable/);
  });
});
