import type { CheckResult } from '@genesis/invariant-runner';
import { InMemoryRawStore } from './landing/raw-store.js';
import { reconstructCandles } from './candles/reconstruct.js';
import { queryAsOf } from './query/as-of.js';
import type { RawRecord, Trade } from './types.js';

const iso = (ms: number) => new Date(ms).toISOString();
function rec(
  kind: RawRecord['kind'],
  symbol: string,
  evMs: number,
  inMs: number,
  seq: number,
): RawRecord {
  return {
    kind,
    symbol,
    event_time: iso(evMs) as RawRecord['event_time'],
    ingest_time: iso(inMs) as RawRecord['ingest_time'],
    event_time_ms: evMs,
    ingest_time_ms: inMs,
    seq,
    payload: {},
  };
}

/** INV-T1: as-of query never returns future (event_time > asOf) records. */
function checkT1(): CheckResult {
  const s = new InMemoryRawStore();
  s.append(rec('trade', 'KRW-BTC', 1000, 1001, 1));
  s.append(rec('trade', 'KRW-BTC', 2000, 2001, 2));
  s.append(rec('trade', 'KRW-BTC', 3000, 3001, 3));
  const r = queryAsOf(s, { asOfEventMs: 2000 });
  const leaked = r.some((x) => x.event_time_ms > 2000);
  return leaked
    ? { id: 'INV-T1', status: 'fail', detail: 'look-ahead leak' }
    : { id: 'INV-T1', status: 'pass' };
}

/** INV-T2: reconstruction emits closed candles only (no repaint). */
function checkT2(): CheckResult {
  const trades: Trade[] = [
    { symbol: 'KRW-BTC', event_time_ms: 10, price: 100, volume: 1, side: 'bid', seq: 1 },
    { symbol: 'KRW-BTC', event_time_ms: 61_000, price: 110, volume: 1, side: 'bid', seq: 2 }, // in 2nd 1m window, still open
  ];
  // asOf inside 2nd window → only 1st (closed) window may appear
  const candles = reconstructCandles('KRW-BTC', trades, '1m', 61_500);
  const emittedOpenWindow = candles.some((c) => c.open_time_ms + 60_000 > 61_500);
  return emittedOpenWindow
    ? { id: 'INV-T2', status: 'fail', detail: 'emitted a forming candle' }
    : { id: 'INV-T2', status: 'pass' };
}

/** INV-T4: candles regenerable deterministically from L1 ticks (same input → same output). */
function checkT4(): CheckResult {
  const trades: Trade[] = [
    { symbol: 'KRW-BTC', event_time_ms: 10, price: 100, volume: 2, side: 'bid', seq: 1 },
    { symbol: 'KRW-BTC', event_time_ms: 30, price: 105, volume: 1, side: 'ask', seq: 2 },
  ];
  const a = JSON.stringify(reconstructCandles('KRW-BTC', trades, '1m', 120_000));
  const b = JSON.stringify(reconstructCandles('KRW-BTC', [...trades].reverse(), '1m', 120_000));
  return a === b
    ? { id: 'INV-T4', status: 'pass' }
    : { id: 'INV-T4', status: 'fail', detail: 'non-deterministic reconstruction' };
}

/** INV-E1: raw landing is append-only (order preserved, nothing dropped). */
function checkE1(): CheckResult {
  const s = new InMemoryRawStore();
  const seqs = [1, 2, 3, 4];
  for (const q of seqs) s.append(rec('trade', 'KRW-BTC', q * 1000, q * 1000 + 1, q));
  const got = s.all().map((r) => r.seq);
  const ok = got.length === seqs.length && got.every((v, i) => v === seqs[i]);
  return ok ? { id: 'INV-E1', status: 'pass' } : { id: 'INV-E1', status: 'fail' };
}

/** INV-T3: memory reads are past-only as-of — a read at time T never returns future records. */
function checkT3(): CheckResult {
  const s = new InMemoryRawStore();
  s.append(rec('trade', 'KRW-BTC', 1000, 1000, 0));
  s.append(rec('trade', 'KRW-BTC', 2000, 2000, 1));
  s.append(rec('trade', 'KRW-BTC', 3000, 3000, 2));
  const pastOnly = s.asOf(2000);
  const ok = pastOnly.length === 2 && pastOnly.every((r) => r.event_time_ms <= 2000);
  return ok ? { id: 'INV-T3', status: 'pass' } : { id: 'INV-T3', status: 'fail' };
}

export const dataLayerChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-T1', fn: checkT1 },
  { id: 'INV-T2', fn: checkT2 },
  { id: 'INV-T4', fn: checkT4 },
  { id: 'INV-E1', fn: checkE1 },
  { id: 'INV-T3', fn: checkT3 },
];
