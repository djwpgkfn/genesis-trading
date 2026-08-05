-- PostgreSQL + TimescaleDB: candles (hypertable), decision_records, append-only events.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS candles (
  symbol        TEXT NOT NULL,
  tf            TEXT NOT NULL,
  open_time_ms  BIGINT NOT NULL,
  open DOUBLE PRECISION, high DOUBLE PRECISION, low DOUBLE PRECISION, close DOUBLE PRECISION,
  volume DOUBLE PRECISION, acc_price DOUBLE PRECISION, source TEXT,
  PRIMARY KEY (symbol, tf, open_time_ms)
);
SELECT create_hypertable('candles', by_range('open_time_ms', 86400000), if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS events (
  seq            BIGINT PRIMARY KEY,
  event_type     TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  snapshot_id    TEXT,
  event_time     TIMESTAMPTZ NOT NULL,
  hash           TEXT NOT NULL,
  prev_hash      TEXT,
  payload        JSONB NOT NULL
);
-- Enforce append-only at the DB level (no UPDATE/DELETE) — INV-E1.
CREATE OR REPLACE RULE events_no_update AS ON UPDATE TO events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE events_no_delete AS ON DELETE TO events DO INSTEAD NOTHING;

CREATE TABLE IF NOT EXISTS decision_records (
  decision_id    TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  snapshot_id    TEXT NOT NULL,
  decided_at     TIMESTAMPTZ NOT NULL,
  action         TEXT NOT NULL,
  reason         TEXT,
  source_event_ids JSONB NOT NULL,
  hash           TEXT NOT NULL
);
