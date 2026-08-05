function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sa = 0,
    sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i]!;
    sb += b[i]!;
  }
  const ma = sa / n,
    mb = sb / n;
  let cov = 0,
    va = 0,
    vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma,
      db = b[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

/** Immutable correlation matrix. Built ONCE and shared to all consumers (INV-A3). */
export class CorrelationMatrix {
  private readonly m = new Map<string, number>();
  readonly symbols: string[];
  static buildCount = 0; // observability for the single-source invariant

  private constructor(symbols: string[]) {
    this.symbols = symbols;
  }

  static build(returns: Record<string, number[]>): CorrelationMatrix {
    CorrelationMatrix.buildCount++;
    const symbols = Object.keys(returns).sort();
    const cm = new CorrelationMatrix(symbols);
    for (const a of symbols) {
      for (const b of symbols) {
        cm.m.set(`${a}|${b}`, a === b ? 1 : pearson(returns[a] ?? [], returns[b] ?? []));
      }
    }
    return cm;
  }

  get(a: string, b: string): number {
    return this.m.get(`${a}|${b}`) ?? 0;
  }

  /** Mean absolute correlation of `symbol` against the others (diversification signal). */
  avgAbsCorr(symbol: string, others: readonly string[]): number {
    const rest = others.filter((s) => s !== symbol);
    if (rest.length === 0) return 0;
    return rest.reduce((acc, s) => acc + Math.abs(this.get(symbol, s)), 0) / rest.length;
  }
}
