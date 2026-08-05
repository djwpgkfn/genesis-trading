import type { RawRecord } from '../types.js';

/** Append-only, bitemporal raw landing (L1). No update/delete (INV-E1). */
export interface RawStore {
  append(rec: RawRecord): void;
  all(): readonly RawRecord[];
  /** As-of read (INV-T1): only records known by the given times (no look-ahead). */
  asOf(asOfEventMs: number, asOfIngestMs?: number): readonly RawRecord[];
  count(): number;
}

/** Reference in-memory adapter. Production adapter (ClickHouse/Timescale/Parquet)
 *  implements the same interface — see docs/STORAGE_DECISION.md. */
export class InMemoryRawStore implements RawStore {
  private readonly records: RawRecord[] = [];

  append(rec: RawRecord): void {
    this.records.push(rec); // append-only: never mutate prior records
  }

  all(): readonly RawRecord[] {
    return this.records;
  }

  asOf(asOfEventMs: number, asOfIngestMs?: number): readonly RawRecord[] {
    return this.records.filter(
      (r) =>
        r.event_time_ms <= asOfEventMs &&
        (asOfIngestMs === undefined || r.ingest_time_ms <= asOfIngestMs),
    );
  }

  count(): number {
    return this.records.length;
  }
}
