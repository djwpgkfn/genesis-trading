-- ClickHouse: append-only raw landing (high-volume ticks/orderbook/ticker). L1 = source of truth.
CREATE DATABASE IF NOT EXISTS genesis;

CREATE TABLE IF NOT EXISTS genesis.raw_records (
  kind          LowCardinality(String),
  symbol        LowCardinality(String),
  event_time_ms UInt64,
  ingest_time_ms UInt64,
  seq           UInt64,
  payload       String,               -- JSON
  ingest_date   Date MATERIALIZED toDate(ingest_time_ms / 1000)
) ENGINE = MergeTree
ORDER BY (symbol, event_time_ms, seq)
PARTITION BY (symbol, ingest_date);
-- append-only by convention: pipeline never issues ALTER/DELETE (INV-E1).
