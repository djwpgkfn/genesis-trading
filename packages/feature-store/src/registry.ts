import type { FeatureDefinition, FeatureRef } from './types.js';
import { refKey } from './types.js';

/** Immutable versioned registry (INV-V1: change = new version, no in-place mutation). */
export class FeatureDefinitionRegistry {
  private readonly defs = new Map<string, FeatureDefinition>();

  register(def: FeatureDefinition): void {
    const key = refKey({ id: def.id, version: def.version });
    if (this.defs.has(key)) {
      throw new Error(`Feature version is immutable; already registered: ${key}`);
    }
    this.defs.set(key, def);
  }

  get(ref: FeatureRef): FeatureDefinition {
    const d = this.defs.get(refKey(ref));
    if (!d) throw new Error(`Unknown feature: ${refKey(ref)}`);
    return d;
  }

  has(ref: FeatureRef): boolean {
    return this.defs.has(refKey(ref));
  }

  all(): readonly FeatureDefinition[] {
    return [...this.defs.values()];
  }
}
