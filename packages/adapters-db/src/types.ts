import type { RawRecord, Candle, Symbol, Timeframe } from '@genesis/data-layer';

/** Async raw landing (real DB). S1's sync RawStore is kept for in-memory/replay determinism. */
export interface AsyncRawStore {
  append(rec: RawRecord): Promise<void>;
  appendBatch(recs: readonly RawRecord[]): Promise<void>;
  asOf(symbol: Symbol, asOfEventMs: number, asOfIngestMs?: number): Promise<RawRecord[]>;
  count(): Promise<number>;
}

export interface CandleStore {
  upsert(candles: readonly Candle[]): Promise<void>;
  range(symbol: Symbol, tf: Timeframe, fromMs: number, toMs: number): Promise<Candle[]>;
}
