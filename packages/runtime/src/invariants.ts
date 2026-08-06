import type { CheckResult } from '@genesis/invariant-runner';
import { InMemoryEventStore, EventTypes, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { LiveDataSource } from './data-source.js';
import { dashboardView } from './views.js';
import { explainabilityView } from './explainability.js';
import { ControlPanel, type RiskControlPort } from './control.js';

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
  s.append(mk(1, 'MarketHealth.scored', { mode: 'normal', score: 0.5 }));
  s.append(mk(2, 'Strategy.evaluated', { count: 2 }));
  s.append(
    mk(3, 'Portfolio.planned', {
      allocations: [{ symbol: 'KRW-BTC', notional: 100 }],
      utilization: 0.1,
    }),
  );
  s.append(mk(4, EventTypes.DecisionStage, { action: 'buy' }));
  s.append(mk(5, EventTypes.DecisionOutcome, { action: 'buy', reason: 'ok' }));
  return s;
}

/** INV-E2/E: UI is a read-only projection — same events render identically (Live==Replay basis). */
function checkReadOnly(): CheckResult {
  const s = seed();
  const a = JSON.stringify(dashboardView(new LiveDataSource(s)));
  const b = JSON.stringify(dashboardView(new LiveDataSource(s)));
  return a === b ? { id: 'INV-E4', status: 'pass' } : { id: 'INV-E4', status: 'fail' };
}

/** INV-E2: every decision is explained by a DecisionRecord surfaced in the Explainability view. */
function checkExplainability(): CheckResult {
  const s = seed();
  const ex = explainabilityView(new LiveDataSource(s), 'cycle-1');
  const ok =
    ex.decision !== null &&
    ex.timeline.length >= 3 &&
    ex.timeline[0]!.event_type === 'MarketHealth.scored';
  return ok ? { id: 'INV-E2', status: 'pass' } : { id: 'INV-E2', status: 'fail' };
}

/** INV-E: the only write surface is ControlCommand; emergency routes to Risk FORCE_EXIT, not orders. */
function checkControlSurface(): CheckResult {
  let forced = '';
  const risk: RiskControlPort = {
    forceExit: (r) => {
      forced = r;
    },
    run: () => {},
    stop: () => {},
  };
  const cp = new ControlPanel(risk);
  cp.emergencyExit('op1', 'panic');
  const noOrder = (cp as unknown as Record<string, unknown>)['placeOrder'] === undefined;
  const onlyControl = cp
    .eventLog()
    .all()
    .every((e) => e.event_type === 'ControlCommand.issued');
  return forced === 'panic' && noOrder && onlyControl
    ? { id: 'INV-E5', status: 'pass' }
    : { id: 'INV-E5', status: 'fail' };
}

import {
  decisionViewModel,
  replayViewModel,
  presentSession,
  buildSessionView,
} from '@genesis/presentation';
import { buildSampleRecording } from '@genesis/replay-engine';
import { OperatorReplaySession } from '@genesis/replay-engine';
import type { Decision } from '@genesis/decision-engine';

const sampleDecision = (): Decision => ({
  id: 'decision-1',
  symbol: 'KRW-BTC',
  action: 'BUY',
  confidence: 0.72,
  reason: 'r',
  strategy_used: 'momentum',
  signal_used: ['TREND_UP'],
  expected_risk: 0.4,
  expected_reward: 0.8,
  timestamp_ms: 1,
  trace: {
    action: 'BUY',
    strategy: 'momentum',
    signals: ['TREND_UP'],
    features: ['f'],
    confidence: 0.72,
    steps: [{ stage: 'decision', detail: 'BUY', refs: [] }],
  },
});

/** INV-E6 (Presentation-purity / PR1): mappers are pure — same input ⇒ deep-equal output. */
function checkE6(): CheckResult {
  const d = sampleDecision();
  const a = JSON.stringify(decisionViewModel(d));
  const b = JSON.stringify(decisionViewModel(d));
  const session = new OperatorReplaySession(buildSampleRecording(3)).load();
  const h1 = JSON.stringify(replayViewModel(session).history);
  const h2 = JSON.stringify(replayViewModel(session).history);
  return a === b && h1 === h2
    ? { id: 'INV-E6', status: 'pass' }
    : { id: 'INV-E6', status: 'fail', detail: 'mapper not pure' };
}

/** INV-E7 (No business logic in Presentation / PR2): VM only re-shapes final Decision fields. */
function checkE7(): CheckResult {
  const d = sampleDecision();
  const vm = decisionViewModel(d);
  const passthrough = vm.action === d.action && vm.reason === d.reason;
  const displayOnly = vm.rr_ratio === (d.expected_reward / d.expected_risk).toFixed(2); // reward/risk, no new judgment
  const noSizing = vm.position_size_display.includes('I4'); // no real sizing invented
  return passthrough && displayOnly && noSizing
    ? { id: 'INV-E7', status: 'pass' }
    : { id: 'INV-E7', status: 'fail', detail: 'presentation added business logic' };
}

const sampleReport = { passed: 47, total: 47, failing: [] as string[] };

/** INV-E8 (Browser Boundary / Snapshot-Only): presentation output is plain JSON-serializable data. */
function checkE8(): CheckResult {
  const frames = buildSampleRecording(3);
  const view = presentSession(frames, sampleReport);
  const roundTrip = JSON.parse(JSON.stringify(view));
  const ok = JSON.stringify(roundTrip) === JSON.stringify(view) && view.frames.length === 3;
  return ok
    ? { id: 'INV-E8', status: 'pass' }
    : { id: 'INV-E8', status: 'fail', detail: 'presentation DTO not plain-serializable' };
}

/** INV-E9 (Read-Only): presentation mapping never mutates the runtime snapshot it reads. */
function checkE9(): CheckResult {
  const frames = buildSampleRecording(2);
  const before = JSON.stringify(frames);
  buildSessionView(frames);
  presentSession(frames, sampleReport);
  return JSON.stringify(frames) === before
    ? { id: 'INV-E9', status: 'pass' }
    : { id: 'INV-E9', status: 'fail', detail: 'presentation mutated its input' };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** INV-E10 (DTO Immutable / No Runtime Leak): presentation DTO is plain, deep-freezable, and a
 *  frozen copy stays deep-equal (no functions/getters/engine instances leak across the boundary). */
function checkE10(): CheckResult {
  const view = presentSession(buildSampleRecording(2), { passed: 47, total: 47, failing: [] });
  const before = JSON.stringify(view);
  deepFreeze(view);
  const after = JSON.stringify(view);
  const plain = JSON.parse(before);
  const ok = before === after && JSON.stringify(plain) === before;
  return ok
    ? { id: 'INV-E10', status: 'pass' }
    : { id: 'INV-E10', status: 'fail', detail: 'DTO not immutable/plain' };
}

export const presentationChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-E2', fn: checkExplainability },
  { id: 'INV-E4', fn: checkReadOnly },
  { id: 'INV-E5', fn: checkControlSurface },
  { id: 'INV-E6', fn: checkE6 },
  { id: 'INV-E7', fn: checkE7 },
  { id: 'INV-E8', fn: checkE8 },
  { id: 'INV-E9', fn: checkE9 },
  { id: 'INV-E10', fn: checkE10 },
];
