import { describe, it, expect } from 'vitest';
import type { RawRecord } from '@genesis/data-layer';
import type { AsyncRawStore } from './types.js';
import { BufferedRawStore } from './buffered-raw-store.js';

class FakeAsync implements AsyncRawStore {
  written: RawRecord[] = [];
  failOnce = false;
  async append(rec: RawRecord): Promise<void> {
    this.written.push(rec);
  }
  async appendBatch(recs: readonly RawRecord[]): Promise<void> {
    if (this.failOnce) {
      this.failOnce = false;
      throw new Error('backing unavailable');
    }
    this.written.push(...recs);
  }
  async asOf(): Promise<RawRecord[]> {
    return this.written;
  }
  async count(): Promise<number> {
    return this.written.length;
  }
}

const rec = (evMs: number, seq: number): RawRecord => ({
  kind: 'trade',
  symbol: 'KRW-BTC',
  event_time: new Date(evMs).toISOString() as RawRecord['event_time'],
  ingest_time: new Date(evMs).toISOString() as RawRecord['ingest_time'],
  event_time_ms: evMs,
  ingest_time_ms: evMs,
  seq,
  payload: {},
});

describe('BufferedRawStore (write-behind bridge)', () => {
  it('buffers sync appends and reads (count/all/asOf)', () => {
    const b = new BufferedRawStore(new FakeAsync(), () => {}, 100);
    b.append(rec(1000, 0));
    b.append(rec(2000, 1));
    b.append(rec(3000, 2));
    expect(b.count()).toBe(3);
    expect(b.asOf(2000).map((r) => r.event_time_ms)).toEqual([1000, 2000]); // past-only
  });

  it('auto-flushes to backing store on batch size', async () => {
    const backing = new FakeAsync();
    const b = new BufferedRawStore(backing, () => {}, 2);
    b.append(rec(1, 0));
    b.append(rec(2, 1)); // reaches batchSize=2 → flush
    await Promise.resolve();
    await b.flush();
    expect(backing.written).toHaveLength(2);
    expect(b.pendingCount()).toBe(0);
  });

  it('requeues pending records if the backing store fails (durability)', async () => {
    const backing = new FakeAsync();
    backing.failOnce = true;
    const errors: unknown[] = [];
    const b = new BufferedRawStore(backing, (e) => errors.push(e), 100);
    b.append(rec(1, 0));
    await b.flush(); // fails → requeued
    expect(errors).toHaveLength(1);
    expect(b.pendingCount()).toBe(1);
    await b.flush(); // retry succeeds
    expect(backing.written).toHaveLength(1);
    expect(b.pendingCount()).toBe(0);
  });
});
