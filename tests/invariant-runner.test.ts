import { describe, it, expect } from 'vitest';
import { INVARIANTS, runAll, registerCheck } from '@genesis/invariant-runner';

describe('invariant runner', () => {
  it('registry enumerates all invariant categories', () => {
    const cats = new Set(INVARIANTS.map((i) => i.category));
    expect([...cats].sort()).toEqual(['A', 'D', 'E', 'R', 'S', 'T', 'TC', 'V']);
    expect(INVARIANTS.length).toBeGreaterThanOrEqual(30);
  });

  it('runs with zero implemented checks and does not fail (S0)', async () => {
    const r = await runAll();
    expect(r.ok).toBe(true);
    expect(r.total).toBe(INVARIANTS.length);
  });

  it('rejects registering an unknown invariant id', () => {
    expect(() => registerCheck('INV-ZZ', () => ({ id: 'INV-ZZ', status: 'pass' }))).toThrow();
  });
});
