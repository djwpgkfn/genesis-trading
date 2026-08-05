import { systemNowMs } from '@genesis/contracts';
export type HealthStatus = 'healthy' | 'warning' | 'critical';
export type ComponentName =
  | 'collector'
  | 'websocket'
  | 'rest'
  | 'database'
  | 'exchange'
  | 'risk'
  | 'portfolio'
  | 'ai'
  | 'replay';

export const COMPONENTS: readonly ComponentName[] = [
  'collector',
  'websocket',
  'rest',
  'database',
  'exchange',
  'risk',
  'portfolio',
  'ai',
  'replay',
];

export interface ComponentHealth {
  component: ComponentName;
  status: HealthStatus;
  detail: string;
  last_beat_ms: number;
}
export interface HealthThresholds {
  warnAfterMs: number;
  critAfterMs: number;
}

/**
 * Observability side-channel — NEVER an input to any decision (Replay determinism preserved).
 * Tracks each component as Healthy / Warning / Critical from heartbeats and explicit reports.
 */
export class HealthMonitor {
  private readonly map = new Map<ComponentName, ComponentHealth>();
  constructor(
    private readonly now: () => number = systemNowMs,
    private readonly th: HealthThresholds = { warnAfterMs: 10_000, critAfterMs: 30_000 },
  ) {
    for (const c of COMPONENTS)
      this.map.set(c, { component: c, status: 'critical', detail: 'no beat', last_beat_ms: 0 });
  }

  heartbeat(component: ComponentName, detail = 'ok'): void {
    this.map.set(component, { component, status: 'healthy', detail, last_beat_ms: this.now() });
  }
  /** Explicit degradation (e.g. elevated error rate, reconnecting). */
  report(component: ComponentName, status: HealthStatus, detail: string): void {
    this.map.set(component, { component, status, detail, last_beat_ms: this.now() });
  }

  status(component: ComponentName): ComponentHealth {
    const h = this.map.get(component)!;
    const age = this.now() - h.last_beat_ms;
    if (h.status !== 'healthy') return h; // explicit status sticks until next beat/report
    if (age > this.th.critAfterMs) return { ...h, status: 'critical', detail: `stale ${age}ms` };
    if (age > this.th.warnAfterMs) return { ...h, status: 'warning', detail: `stale ${age}ms` };
    return h;
  }
  all(): ComponentHealth[] {
    return COMPONENTS.map((c) => this.status(c));
  }
  overall(): HealthStatus {
    const s = this.all().map((h) => h.status);
    if (s.includes('critical')) return 'critical';
    if (s.includes('warning')) return 'warning';
    return 'healthy';
  }
}
