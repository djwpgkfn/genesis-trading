import { systemNowMs } from '@genesis/contracts';
export interface HistoStat {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
}

/** Metric names Genesis tracks. */
export const METRICS = {
  eventsProcessed: 'events_processed',
  cycleTimeMs: 'cycle_time_ms',
  replaySpeed: 'replay_speed',
  wsLatencyMs: 'ws_latency_ms',
  restLatencyMs: 'rest_latency_ms',
  dbWriteMs: 'db_write_ms',
  orderResponseMs: 'order_response_ms',
  riskApproveMs: 'risk_approve_ms',
  portfolioComputeMs: 'portfolio_compute_ms',
} as const;

/** In-memory metrics registry (observability only; never feeds decisions). */
export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly histos = new Map<
    string,
    { count: number; sum: number; min: number; max: number }
  >();
  constructor(private readonly now: () => number = systemNowMs) {}

  counter(name: string, delta = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }
  observe(name: string, value: number): void {
    const h = this.histos.get(name) ?? { count: 0, sum: 0, min: Infinity, max: -Infinity };
    h.count++;
    h.sum += value;
    h.min = Math.min(h.min, value);
    h.max = Math.max(h.max, value);
    this.histos.set(name, h);
  }
  /** Start a timer; returns a stop() that records the elapsed ms into `name`. */
  timer(name: string): () => number {
    const start = this.now();
    return () => {
      const d = this.now() - start;
      this.observe(name, d);
      return d;
    };
  }
  snapshot(): { counters: Record<string, number>; histograms: Record<string, HistoStat> } {
    const histograms: Record<string, HistoStat> = {};
    for (const [k, h] of this.histos) histograms[k] = { ...h, avg: h.count ? h.sum / h.count : 0 };
    return { counters: Object.fromEntries(this.counters), histograms };
  }
}
