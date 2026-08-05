import { randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlation_id?: string;
  request_id?: string;
  snapshot_id?: string;
  execution_id?: string;
  replay_id?: string;
  trace_id?: string;
}
export interface LogEntry { ts: string; level: LogLevel; message: string; ctx: LogContext; fields?: Record<string, unknown> }
export type LogSink = (e: LogEntry) => void;

/** Structured logger. Every entry carries the standard correlation IDs. Separate from the event log. */
export class StructuredLogger {
  constructor(
    private readonly sink: LogSink = (e) => console.log(JSON.stringify(e)),
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly ctx: LogContext = {},
  ) {}

  /** Derive a child logger with merged context (e.g. a new trace_id per flow). */
  child(ctx: LogContext): StructuredLogger {
    return new StructuredLogger(this.sink, this.now, { ...this.ctx, ...ctx });
  }

  log(level: LogLevel, message: string, ctx: LogContext = {}, fields?: Record<string, unknown>): LogEntry {
    const merged: LogContext = { trace_id: this.ctx.trace_id ?? randomUUID(), ...this.ctx, ...ctx };
    const entry: LogEntry = fields
      ? { ts: this.now(), level, message, ctx: merged, fields }
      : { ts: this.now(), level, message, ctx: merged };
    this.sink(entry);
    return entry;
  }
  info(m: string, c?: LogContext, f?: Record<string, unknown>): LogEntry { return this.log('info', m, c, f); }
  warn(m: string, c?: LogContext, f?: Record<string, unknown>): LogEntry { return this.log('warn', m, c, f); }
  error(m: string, c?: LogContext, f?: Record<string, unknown>): LogEntry { return this.log('error', m, c, f); }
}
