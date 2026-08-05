import { describe, it, expect } from 'vitest';
import { assessQuality, normalizeInput } from './quality.js';
import type { RawRecord } from '@genesis/data-layer';

const iso = (ms: number) => new Date(ms).toISOString() as RawRecord['event_time'];
const r = (ev: number, seq: number): RawRecord => ({
  kind: 'trade', symbol: 'KRW-BTC', event_time: iso(ev), ingest_time: iso(ev),
  event_time_ms: ev, ingest_time_ms: ev, seq, payload: {},
});

describe('data quality', () => {
  it('flags Duplicated, OutOfOrder, GapDetected', () => {
    // seqs {1,4,2,2}: unique {1,2,4} -> missing 3 (gap); dup seq 2; 2000<3000 -> out-of-order
    const rep = assessQuality([r(1000, 1), r(3000, 4), r(2000, 2), r(2000, 2)]);
    expect(rep.states.has('Duplicated')).toBe(true);
    expect(rep.states.has('OutOfOrder')).toBe(true);
    expect(rep.states.has('GapDetected')).toBe(true);
  });
  it('marks RestFilled via filledSeqs', () => {
    const rep = assessQuality([r(1000, 1), r(2000, 2)], { filledSeqs: new Set([2]) });
    expect(rep.states.has('RestFilled')).toBe(true);
    expect(rep.restFilled).toBe(1);
  });
  it('normalizeInput dedupes and orders deterministically', () => {
    const { records } = normalizeInput([r(3000, 3), r(1000, 1), r(1000, 1), r(2000, 2)]);
    expect(records.map((x) => x.seq)).toEqual([1, 2, 3]);
  });
  it('Complete when clean', () => {
    expect(assessQuality([r(1000, 1), r(2000, 2)]).states.has('Complete')).toBe(true);
  });
});
