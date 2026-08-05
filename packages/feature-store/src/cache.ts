import type { FeatureRef, FeatureValue } from './types.js';
import type { Symbol } from '@genesis/data-layer';
import { refKey } from './types.js';

/**
 * Materialized feature cache. Key includes the pinned version, so a version change is a new key
 * (never stale). Cache is an OPTIMIZATION only: on miss the caller recomputes from L1 (INV-T4),
 * so correctness never depends on the cache.
 */
export interface FeatureCache {
  get(key: string): FeatureValue | undefined;
  set(key: string, value: FeatureValue): void;
  has(key: string): boolean;
  size(): number;
}

export function cacheKey(ref: FeatureRef, symbol: Symbol, asOfMs: number): string {
  return `${refKey(ref)}|${symbol}|${asOfMs}`;
}

export class InMemoryFeatureCache implements FeatureCache {
  private readonly m = new Map<string, FeatureValue>();
  get(key: string): FeatureValue | undefined {
    return this.m.get(key);
  }
  set(key: string, value: FeatureValue): void {
    this.m.set(key, value);
  }
  has(key: string): boolean {
    return this.m.has(key);
  }
  size(): number {
    return this.m.size;
  }
}
