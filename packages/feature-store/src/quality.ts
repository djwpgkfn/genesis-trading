import { detectSeqGaps } from '@genesis/data-layer';
import type { RawRecord } from '@genesis/data-layer';

export type QualityState = 'Complete' | 'GapDetected' | 'RestFilled' | 'OutOfOrder' | 'Duplicated';

export interface QualityReport {
  states: ReadonlySet<QualityState>;
  duplicates: number;
  outOfOrder: number;
  gaps: number;
  restFilled: number;
}

export interface AssessOptions {
  /** seqs that were backfilled via REST rather than live WS. */
  filledSeqs?: ReadonlySet<number>;
}

/** Classify raw input quality (operates on records in arrival order). */
export function assessQuality(
  records: readonly RawRecord[],
  opts: AssessOptions = {},
): QualityReport {
  const seen = new Set<number>();
  let duplicates = 0;
  let outOfOrder = 0;
  let lastEv = -Infinity;
  for (const r of records) {
    if (seen.has(r.seq)) duplicates++;
    else seen.add(r.seq);
    if (r.event_time_ms < lastEv) outOfOrder++;
    lastEv = Math.max(lastEv, r.event_time_ms);
  }
  const gaps = detectSeqGaps(records.map((r) => r.seq)).reduce((a, g) => a + g.missing, 0);
  const restFilled = opts.filledSeqs
    ? records.filter((r) => opts.filledSeqs!.has(r.seq)).length
    : 0;

  const states = new Set<QualityState>();
  if (duplicates > 0) states.add('Duplicated');
  if (outOfOrder > 0) states.add('OutOfOrder');
  if (gaps > 0) states.add('GapDetected');
  if (restFilled > 0) states.add('RestFilled');
  if (states.size === 0) states.add('Complete');

  return { states, duplicates, outOfOrder, gaps, restFilled };
}

/** Deterministically normalize input: drop duplicate seqs (keep first), sort by (event_time, seq). */
export function normalizeInput(records: readonly RawRecord[]): {
  records: RawRecord[];
  report: QualityReport;
} {
  const report = assessQuality(records);
  const seen = new Set<number>();
  const deduped: RawRecord[] = [];
  for (const r of records) {
    if (seen.has(r.seq)) continue;
    seen.add(r.seq);
    deduped.push(r);
  }
  deduped.sort((a, b) => a.event_time_ms - b.event_time_ms || a.seq - b.seq);
  return { records: deduped, report };
}
