import type { RawStore } from '../landing/raw-store.js';
import type { MarketDataKind, RawRecord, Symbol } from '../types.js';

export interface AsOfQuery {
  asOfEventMs: number;
  asOfIngestMs?: number;
  symbol?: Symbol;
  kind?: MarketDataKind;
}

/**
 * Point-in-time read (INV-T1). Guarantees no record with event_time > asOfEventMs
 * (and ingest_time > asOfIngestMs when provided) is ever returned.
 */
export function queryAsOf(store: RawStore, q: AsOfQuery): readonly RawRecord[] {
  return store
    .asOf(q.asOfEventMs, q.asOfIngestMs)
    .filter((r) => (q.symbol ? r.symbol === q.symbol : true))
    .filter((r) => (q.kind ? r.kind === q.kind : true));
}
