import { INVARIANTS, type InvariantSpec } from './registry.js';

export interface CheckResult {
  id: string;
  status: 'pass' | 'fail' | 'not-implemented';
  detail?: string;
}
export type InvariantCheck = () => CheckResult | Promise<CheckResult>;

const checks = new Map<string, InvariantCheck>();

/** Stages (S1+) register concrete checks against invariant IDs. */
export function registerCheck(id: string, fn: InvariantCheck): void {
  if (!INVARIANTS.some((i) => i.id === id)) {
    throw new Error(`Unknown invariant id: ${id}`);
  }
  checks.set(id, fn);
}

export interface RunReport {
  ok: boolean;
  total: number;
  implemented: number;
  results: CheckResult[];
}

/** Runs all registered checks; unimplemented invariants are reported (not failed) in S0. */
export async function runAll(): Promise<RunReport> {
  const results: CheckResult[] = [];
  for (const spec of INVARIANTS as InvariantSpec[]) {
    const fn = checks.get(spec.id);
    if (!fn) {
      results.push({ id: spec.id, status: 'not-implemented' });
      continue;
    }
    try {
      results.push(await fn());
    } catch (e) {
      results.push({ id: spec.id, status: 'fail', detail: e instanceof Error ? e.message : String(e) });
    }
  }
  const ok = results.every((r) => r.status !== 'fail');
  return {
    ok,
    total: results.length,
    implemented: results.filter((r) => r.status !== 'not-implemented').length,
    results,
  };
}
