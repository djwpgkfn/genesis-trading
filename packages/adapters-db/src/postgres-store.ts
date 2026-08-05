import pg from 'pg';

interface CandleRow { symbol: string; tf: string; open_time_ms: string | number; open: string | number; high: string | number; low: string | number; close: string | number; volume: string | number; acc_price: string | number; source: string }
import type { Candle, Symbol, Timeframe } from '@genesis/data-layer';
import type { CandleStore } from './types.js';

/** Real PostgreSQL + TimescaleDB store: candles (hypertable), decision_records, events (append-only). */
export class PostgresStore implements CandleStore {
  private readonly pool: pg.Pool;
  constructor(connectionString = process.env['PG_URL'] ?? 'postgres://localhost:5432/genesis') {
    this.pool = new pg.Pool({ connectionString });
  }

  async upsert(candles: readonly Candle[]): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      for (const k of candles) {
        await c.query(
          `INSERT INTO candles(symbol, tf, open_time_ms, open, high, low, close, volume, acc_price, source)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (symbol, tf, open_time_ms) DO UPDATE SET
             open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close,
             volume=EXCLUDED.volume, acc_price=EXCLUDED.acc_price, source=EXCLUDED.source`,
          [k.symbol, k.tf, k.open_time_ms, k.open, k.high, k.low, k.close, k.volume, k.acc_price, k.source],
        );
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async range(symbol: Symbol, tf: Timeframe, fromMs: number, toMs: number): Promise<Candle[]> {
    const res = await this.pool.query<CandleRow>(
      `SELECT symbol, tf, open_time_ms, open, high, low, close, volume, acc_price, source
       FROM candles WHERE symbol=$1 AND tf=$2 AND open_time_ms>=$3 AND open_time_ms<=$4
       ORDER BY open_time_ms`,
      [symbol, tf, fromMs, toMs],
    );
    return res.rows.map((r) => ({
      symbol: r.symbol, tf: r.tf as Timeframe, open_time_ms: Number(r.open_time_ms),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      volume: Number(r.volume), acc_price: Number(r.acc_price), source: r.source as Candle['source'],
    }));
  }

  /** Append-only event log (INV-E1): no UPDATE/DELETE ever issued. */
  async appendEvent(e: { seq: number; event_type: string; correlation_id: string; snapshot_id: string | null; event_time: string; hash: string; prev_hash: string | null; payload: unknown }): Promise<void> {
    await this.pool.query(
      `INSERT INTO events(seq, event_type, correlation_id, snapshot_id, event_time, hash, prev_hash, payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.seq, e.event_type, e.correlation_id, e.snapshot_id, e.event_time, e.hash, e.prev_hash, JSON.stringify(e.payload)],
    );
  }

  async close(): Promise<void> { await this.pool.end(); }
}
