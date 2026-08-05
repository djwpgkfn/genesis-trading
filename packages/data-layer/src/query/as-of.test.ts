import { describe, it, expect } from 'vitest';
import { InMemoryRawStore } from '../landing/raw-store.js';
import { queryAsOf } from './as-of.js';
import type { RawRecord } from '../types.js';

const iso = (ms: number) => new Date(ms).toISOString() as RawRecord['event_time'];
const rec = (evMs: number, inMs: number, seq: number): RawRecord => ({
  kind: 'trade',
  symbol: 'KRW-BTC',
  event_time: iso(evMs),
  ingest_time: iso(inMs),
  event_time_ms: evMs,
  ingest_time_ms: inMs,
  seq,
  payload: {},
});

describe('queryAsOf (INV-T1)', () => {
  it('never returns future records', () => {
    const s = new InMemoryRawStore();
    [rec(1000, 1001, 1), rec(2000, 2001, 2), rec(3000, 3001, 3)].forEach((r) => s.append(r));
    const r = queryAsOf(s, { asOfEventMs: 2000 });
    expect(r.every((x) => x.event_time_ms <= 2000)).toBe(true);
    expect(r).toHaveLength(2);
  });

  it('respects bitemporal knowledge time', () => {
    const s = new InMemoryRawStore();
    s.append(rec(1000, 5000, 1)); // happened at 1000 but only known at 5000
    expect(queryAsOf(s, { asOfEventMs: 2000, asOfIngestMs: 3000 })).toHaveLength(0);
    expect(queryAsOf(s, { asOfEventMs: 2000, asOfIngestMs: 6000 })).toHaveLength(1);
  });
});
