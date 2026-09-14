import { describe, it, expect } from 'vitest';
import { runScenario, runSoak, type Fault } from './soak-harness.js';

const FAULTS: Array<{ name: string; fault: Fault }> = [
  { name: '1-normal', fault: 'normal' },
  { name: '2-partial', fault: 'partial' },
  { name: '3-duplicate', fault: 'duplicate' },
  { name: '4-multi', fault: 'multi' },
  { name: '5-rejected', fault: 'rejected' },
  { name: '6-throw', fault: 'throw' },
  { name: '7-async-fail', fault: 'rejected' },
  { name: '8-kill', fault: 'kill' },
  { name: '9-reconciliation', fault: 'normal' },
  { name: '10-timeout', fault: 'throw' },
];

describe('I4-7A-1: dry-run soak harness (real path, fake exchange only)', () => {
  for (const { name, fault } of FAULTS) {
    it(`scenario ${name} passes with real_orders=0`, async () => {
      const r = await runScenario(name, fault, `test-${name}`);
      expect(r.real_orders).toBe(0);
      expect(r.pass, r.detail).toBe(true);
    });
  }

  it('kill-switch scenario calls the exchange adapter 0 times', async () => {
    const r = await runScenario('kill', 'kill', 'test-kill-calls');
    expect(r.adapter_calls).toBe(0);
    expect(r.pass).toBe(true);
  });

  it('duplicate trade_uuid is deduped (only one fill applied)', async () => {
    const r = await runScenario('dup', 'duplicate', 'test-dup');
    expect(r.fills).toBe(1);
    expect(r.deduped).toBe(1);
  });

  it('short soak loop: no exceptions, real_orders 0, budget consistent, pass', async () => {
    const m = await runSoak(25);
    expect(m.exceptions).toBe(0);
    expect(m.real_orders).toBe(0);
    expect(m.budget_consistent).toBe(true);
    expect(m.cycles).toBe(25);
    expect(m.pass, JSON.stringify(m.scenarios.filter((s) => !s.pass))).toBe(true);
  });

  it('metrics object is machine-readable with required fields', async () => {
    const m = await runSoak(5);
    for (const k of ['cycles', 'orders_submitted', 'confirmFill_count', 'release_count', 'adapter_calls', 'exceptions', 'real_orders', 'budget_consistent', 'pass']) {
      expect(m).toHaveProperty(k);
    }
  });
});
