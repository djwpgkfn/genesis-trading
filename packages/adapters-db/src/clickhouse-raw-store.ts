import { createClient, type ClickHouseClient } from '@clickhouse/client';
import type { RawRecord, Symbol } from '@genesis/data-layer';
import type { AsyncRawStore } from './types.js';

/** Real ClickHouse-backed append-only raw landing (high-volume ticks/orderbook). INV-E1/T1 preserved. */
export class ClickHouseRawStore implements AsyncRawStore {
  private readonly client: ClickHouseClient;
  constructor(
    url = process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123',
    database = 'genesis',
  ) {
    this.client = createClient({ url, database });
  }

  async append(rec: RawRecord): Promise<void> {
    await this.appendBatch([rec]);
  }
  async appendBatch(recs: readonly RawRecord[]): Promise<void> {
    if (recs.length === 0) return;
    await this.client.insert({
      table: 'raw_records',
      values: recs.map((r) => ({
        kind: r.kind,
        symbol: r.symbol,
        event_time_ms: r.event_time_ms,
        ingest_time_ms: r.ingest_time_ms,
        seq: r.seq,
        payload: JSON.stringify(r.payload),
      })),
      format: 'JSONEachRow',
    });
  }
  async asOf(symbol: Symbol, asOfEventMs: number, asOfIngestMs?: number): Promise<RawRecord[]> {
    const ingestClause = asOfIngestMs !== undefined ? ` AND ingest_time_ms <= ${asOfIngestMs}` : '';
    const rows = await this.client.query({
      query: `SELECT kind, symbol, event_time_ms, ingest_time_ms, seq, payload
              FROM raw_records
              WHERE symbol = {symbol:String} AND event_time_ms <= {asof:UInt64}${ingestClause}
              ORDER BY event_time_ms, seq`,
      query_params: { symbol, asof: asOfEventMs },
      format: 'JSONEachRow',
    });
    const data = (await rows.json()) as Array<Record<string, unknown>>;
    return data.map((d) => ({
      kind: d['kind'] as RawRecord['kind'],
      symbol: String(d['symbol']),
      event_time: new Date(Number(d['event_time_ms'])).toISOString() as RawRecord['event_time'],
      ingest_time: new Date(Number(d['ingest_time_ms'])).toISOString() as RawRecord['ingest_time'],
      event_time_ms: Number(d['event_time_ms']),
      ingest_time_ms: Number(d['ingest_time_ms']),
      seq: Number(d['seq']),
      payload: JSON.parse(String(d['payload'])),
    }));
  }
  async count(): Promise<number> {
    const r = await this.client.query({
      query: 'SELECT count() AS c FROM raw_records',
      format: 'JSONEachRow',
    });
    const rows = (await r.json()) as Array<{ c: string }>;
    return Number(rows[0]?.c ?? 0);
  }
  async close(): Promise<void> {
    await this.client.close();
  }
}
