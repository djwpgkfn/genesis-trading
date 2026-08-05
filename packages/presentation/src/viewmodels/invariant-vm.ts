export interface InvariantReport {
  passed: number;
  total: number;
  failing: string[];
}
export interface InvariantViewModel {
  passed: number;
  total: number;
  status: 'GREEN' | 'RED';
  label: string;
  failing: string[];
}

/** Pure mapper: an invariant report → display shape. Read-only; computes no invariants. */
export function invariantViewModel(r: InvariantReport): InvariantViewModel {
  const green = r.failing.length === 0 && r.passed === r.total;
  return {
    passed: r.passed,
    total: r.total,
    status: green ? 'GREEN' : 'RED',
    label: `${r.passed}/${r.total}`,
    failing: [...r.failing],
  };
}
