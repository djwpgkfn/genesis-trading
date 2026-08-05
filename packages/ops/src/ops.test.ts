import { describe, it, expect } from 'vitest';
import {
  InMemoryEventStore,
  EventTypes,
  projectDecision,
  type EventInput,
} from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { HealthMonitor } from './health.js';
import { StructuredLogger, type LogEntry } from './logging.js';
import { Metrics, METRICS } from './metrics.js';
import { AlertSystem } from './alerts.js';
import { FailureAutomation } from './failure-automation.js';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());
function seed(): InMemoryEventStore {
  const s = new InMemoryEventStore();
  const mk = (n: number, type: string, payload: unknown): EventInput => ({
    event_id: asUUID(`e${n}`),
    event_type: type,
    event_time: iso(n * 1000),
    ingest_time: iso(n * 1000),
    source_engine: 't',
    schema_version: 1,
    correlation_id: asCorrelationId('cycle-1'),
    snapshot_id: asSnapshotId('s1'),
    payload,
  });
  s.append(mk(1, EventTypes.DecisionStage, {}));
  s.append(mk(2, EventTypes.DecisionOutcome, { action: 'buy', reason: 'ok' }));
  return s;
}

describe('Health Monitor', () => {
  it('tracks Healthy/Warning/Critical per component', () => {
    let clock = 100_000;
    const hm = new HealthMonitor(() => clock, { warnAfterMs: 10_000, critAfterMs: 30_000 });
    hm.heartbeat('websocket');
    expect(hm.status('websocket').status).toBe('healthy');
    clock += 15_000;
    expect(hm.status('websocket').status).toBe('warning');
    clock += 20_000;
    expect(hm.status('websocket').status).toBe('critical');
    hm.report('database', 'critical', 'connection lost');
    expect(hm.overall()).toBe('critical');
  });
});

describe('Structured Logging', () => {
  it('includes correlation/request/snapshot/execution/replay/trace ids', () => {
    const out: LogEntry[] = [];
    const log = new StructuredLogger(
      (e) => out.push(e),
      () => '2026-07-28T00:00:00.000Z',
      { trace_id: 'T1' },
    );
    log
      .child({ correlation_id: 'C1', snapshot_id: 'S1' })
      .info('order', { request_id: 'R1', execution_id: 'X1', replay_id: 'RP1' });
    const ctx = out[0]!.ctx;
    expect(ctx).toMatchObject({
      trace_id: 'T1',
      correlation_id: 'C1',
      snapshot_id: 'S1',
      request_id: 'R1',
      execution_id: 'X1',
      replay_id: 'RP1',
    });
  });
});

describe('Metrics', () => {
  it('records counters, histograms, and timers', () => {
    let clock = 0;
    const m = new Metrics(() => clock);
    m.counter(METRICS.eventsProcessed, 5);
    const stop = m.timer(METRICS.cycleTimeMs);
    clock = 42;
    stop();
    m.observe(METRICS.wsLatencyMs, 12);
    const snap = m.snapshot();
    expect(snap.counters[METRICS.eventsProcessed]).toBe(5);
    expect(snap.histograms[METRICS.cycleTimeMs]!.max).toBe(42);
    expect(snap.histograms[METRICS.wsLatencyMs]!.avg).toBe(12);
  });
});

describe('Alert System', () => {
  it('raises alerts with default severities and notifies handlers', () => {
    const got: string[] = [];
    const a = new AlertSystem(() => '2026-07-28T00:00:00.000Z');
    a.on((al) => got.push(`${al.type}:${al.severity}`));
    a.raise('risk_halt', 'risk', 'HALT latched');
    a.raise('ws_disconnect', 'websocket', 'closed');
    expect(got).toEqual(['risk_halt:critical', 'ws_disconnect:warning']);
  });
});

describe('Failure Automation (determinism preserved)', () => {
  it('auto-creates replay session + incident report linked to DecisionRecords', () => {
    const src = seed();
    const alerts = new AlertSystem(() => '2026-07-28T00:00:00.000Z');
    const logger = new StructuredLogger(
      () => {},
      () => '2026-07-28T00:00:00.000Z',
    );
    const fa = new FailureAutomation(
      src,
      new InMemoryEventStore(),
      alerts,
      logger,
      () => '2026-07-28T00:00:00.000Z',
    );
    const { report } = fa.onFailure('risk_halt', 's1', 'risk halted');
    expect(report.snapshot_id).toBe('s1');
    expect(report.replay_session_id).toContain('replay');
    expect(report.decision_ids.length).toBeGreaterThan(0);
    expect(alerts.history()).toHaveLength(1);
  });

  it('ops does NOT change decisions (Replay determinism preserved)', () => {
    const src = seed();
    const before = projectDecision(src.byCorrelation('cycle-1'));
    // run full ops path (health, metrics, alerts, failure automation) over the same log
    new HealthMonitor().heartbeat('risk');
    new Metrics().counter('events_processed', 2);
    const fa = new FailureAutomation(
      src,
      new InMemoryEventStore(),
      new AlertSystem(),
      new StructuredLogger(() => {}),
    );
    fa.onFailure('risk_halt', 's1', 'x');
    const after = projectDecision(src.byCorrelation('cycle-1'));
    expect(after).toEqual(before); // identical DecisionRecord — ops is a pure side-channel
  });
});
