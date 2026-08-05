import type { RawStore, RawRecord } from '@genesis/data-layer';
import type { AsyncRawStore } from './types.js';

/**
 * Write-behind bridge: implements the sync RawStore (collector-facing) while durably flushing
 * appends to an async backing store (ClickHouse/Postgres) in batches. Append-only; as-of reads
 * over the in-memory hot buffer preserve past-only semantics (INV-E1/T1 unaffected).
 */
export class BufferedRawStore implements RawStore {
  private readonly hot: RawRecord[] = [];
  private pending: RawRecord[] = [];
  private flushing = false;

  constructor(
    private readonly backing: AsyncRawStore,
    private readonly onError: (e: unknown) => void = () => {},
    private readonly batchSize = 200,
  ) {}

  append(rec: RawRecord): void {
    this.hot.push(rec); // sync hot view for reads
    this.pending.push(rec); // durable write-behind queue
    if (this.pending.length >= this.batchSize) void this.flush();
  }

  all(): readonly RawRecord[] {
    return this.hot;
  }

  asOf(asOfEventMs: number, asOfIngestMs?: number): readonly RawRecord[] {
    return this.hot.filter(
      (r) =>
        r.event_time_ms <= asOfEventMs &&
        (asOfIngestMs === undefined || r.ingest_time_ms <= asOfIngestMs),
    );
  }

  count(): number {
    return this.hot.length;
  }

  /** Number of records not yet confirmed written to the backing store. */
  pendingCount(): number {
    return this.pending.length;
  }

  /** Flush the pending queue to the async backing store. Safe to call repeatedly. */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.length === 0) return;
    this.flushing = true;
    const batch = this.pending;
    this.pending = [];
    try {
      await this.backing.appendBatch(batch);
    } catch (e) {
      this.pending = [...batch, ...this.pending]; // requeue for retry (durability)
      this.onError(e);
    } finally {
      this.flushing = false;
    }
  }
}
