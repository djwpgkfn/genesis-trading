import type { CorrelationMatrix } from './correlation.js';
import type { Candidate, ExplainEntry, PortfolioConstraints } from './types.js';

/** Binary Kelly fraction, long-only (never negative). */
export function kellyFraction(c: Candidate): number {
  const f = c.winProb - (1 - c.winProb) / c.payoffRatio;
  return Math.max(0, f);
}

/**
 * Objective = LONG-TERM SURVIVAL, not return maximization:
 *  1) fractional Kelly (kellyFraction << 1) — avoids over-betting / ruin,
 *  2) correlation penalty — diversify away from correlated clusters,
 *  3) hard caps — per-symbol, correlation-group, total utilization,
 *  4) clip to Risk budget available (never bypasses Risk).
 * Deterministic (sorted iteration).
 */
export function optimize(
  candidates: readonly Candidate[],
  corr: CorrelationMatrix,
  constraints: PortfolioConstraints,
  budget: { total: number; available: number },
): { weights: Map<string, number>; explain: ExplainEntry[] } {
  const symbols = [...candidates].map((c) => c.symbol).sort();
  const explain: ExplainEntry[] = [];
  const weights = new Map<string, number>();

  for (const sym of symbols) {
    const c = candidates.find((x) => x.symbol === sym)!;
    const raw = kellyFraction(c);
    const frac = raw * constraints.kellyFraction; // fractional Kelly (survival)
    const avgCorr = corr.avgAbsCorr(sym, symbols);
    const afterCorr = frac / (1 + avgCorr); // correlation penalty (diversification)
    const afterCap = Math.min(afterCorr, constraints.maxWeightPerSymbol); // per-position ruin cap
    weights.set(sym, afterCap);
    explain.push({
      symbol: sym, kelly_raw: raw, after_correlation: afterCorr, after_constraints: afterCap,
      final_weight: afterCap, notional: 0,
      reason: `fracKelly=${constraints.kellyFraction} avgCorr=${avgCorr.toFixed(3)} capped=${afterCap.toFixed(4)}`,
    });
  }

  // correlation-group exposure cap: greedily cluster by threshold, scale group down if over.
  const groups = clusterByCorrelation(symbols, corr, constraints.correlationThreshold);
  for (const g of groups) {
    const sum = g.reduce((a, s) => a + (weights.get(s) ?? 0), 0);
    if (sum > constraints.maxCorrelationGroupExposure && sum > 0) {
      const scale = constraints.maxCorrelationGroupExposure / sum;
      for (const s of g) weights.set(s, (weights.get(s) ?? 0) * scale);
    }
  }

  // total utilization cap AND Risk-budget cap (INV-R5: never exceed available).
  const totalW = [...weights.values()].reduce((a, w) => a + w, 0);
  const availFrac = budget.total > 0 ? budget.available / budget.total : 0;
  const utilCap = Math.min(constraints.maxTotalUtilization, availFrac);
  if (totalW > utilCap && totalW > 0) {
    const scale = utilCap / totalW;
    for (const [s, w] of weights) weights.set(s, w * scale);
  }

  // finalize explain weights
  for (const e of explain) {
    e.final_weight = weights.get(e.symbol) ?? 0;
  }
  return { weights, explain };
}

function clusterByCorrelation(symbols: readonly string[], corr: CorrelationMatrix, threshold: number): string[][] {
  const groups: string[][] = [];
  const assigned = new Set<string>();
  for (const s of symbols) {
    if (assigned.has(s)) continue;
    const group = [s];
    assigned.add(s);
    for (const t of symbols) {
      if (!assigned.has(t) && Math.abs(corr.get(s, t)) >= threshold) {
        group.push(t);
        assigned.add(t);
      }
    }
    groups.push(group);
  }
  return groups;
}
