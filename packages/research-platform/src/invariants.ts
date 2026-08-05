import type { CheckResult } from '@genesis/invariant-runner';
import { InMemoryEventStore, EventTypes, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { ResearchPlatform } from './platform.js';
import { ExperimentRunner } from './experiment.js';
import { makeVirtualExecution } from './isolation.js';
import { ResearchChampionChallenger } from './champion-challenger.js';
import type { Experiment, Hypothesis } from './types.js';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());
function marketLog(): InMemoryEventStore {
  const s = new InMemoryEventStore();
  for (let n = 1; n <= 6; n++) {
    const base: EventInput = {
      event_id: asUUID(`e${n}`), event_type: EventTypes.DecisionOutcome, event_time: iso(n * 1000), ingest_time: iso(n * 1000),
      source_engine: 't', schema_version: 1, correlation_id: asCorrelationId(`c${n}`), snapshot_id: asSnapshotId('s1'),
      payload: { action: n % 2 ? 'buy' : 'sell', reason: 'x' },
    };
    s.append(base);
  }
  return s;
}
const hyp: Hypothesis = { hypothesis_id: 'h1', statement: 'active', success_criteria: { activity: 1 }, status: 'testing' };
function exp(mode: Experiment['mode']): Experiment {
  return {
    experiment_id: `x-${mode}`, hypothesis_id: 'h1', snapshot_id: 'snap1', strategy_version: '1.0.0',
    feature_set_version: '1.0.0', dataset: 'ds1', period: { start: 0, end: 7000 }, mode, status: 'created',
    provenance: { created_by: 'test', method_version: '1', created_at: iso(0) },
  };
}

/** INV-S3: Research execution is virtual-only; no real-account path exists. */
function checkS3(): CheckResult {
  const exec = makeVirtualExecution();
  // The only executor available is virtual; there is no real-broker constructor in this package.
  return exec.mode === 'virtual'
    ? { id: 'INV-S3', status: 'pass' }
    : { id: 'INV-S3', status: 'fail', detail: 'non-virtual execution present' };
}

/** INV-S5: promotion requires WFV validation (no promotion past gate without WFV pass). */
function checkS5(): CheckResult {
  const cc = new ResearchChampionChallenger();
  const backtestExp = { ...exp('backtest'), status: 'completed' as const, result: { metrics: { activity: 5 }, passed: true, decisions: 6 } };
  const d1 = cc.evaluate(backtestExp); // no folds → must be rejected
  const runner = new ExperimentRunner();
  const wfvExp = { ...exp('wfv'), status: 'completed' as const, result: runner.runWFV(exp('wfv'), marketLog(), hyp, 3) };
  const d2 = cc.evaluate(wfvExp);
  return d1.outcome === 'rejected' && d2.outcome === 'promoted-in-research'
    ? { id: 'INV-S5', status: 'pass' }
    : { id: 'INV-S5', status: 'fail', detail: `${d1.outcome}/${d2.outcome}` };
}

/** INV-E1: research artifacts are event-sourced (append-only chain intact). */
function checkE1(): CheckResult {
  const rp = new ResearchPlatform();
  rp.registerHypothesis(hyp);
  rp.runExperiment(exp('backtest'), marketLog(), hyp);
  return rp.eventLog().verifyChain() && rp.eventLog().count() >= 3
    ? { id: 'INV-E1', status: 'pass' }
    : { id: 'INV-E1', status: 'fail' };
}

/** INV-D2: same experiment reproduces identical result via Replay. */
function checkD2(): CheckResult {
  const runner = new ExperimentRunner();
  const src = marketLog();
  const a = runner.run(exp('backtest'), src, hyp);
  const b = runner.run(exp('backtest'), src, hyp);
  return JSON.stringify(a) === JSON.stringify(b)
    ? { id: 'INV-D2', status: 'pass' }
    : { id: 'INV-D2', status: 'fail' };
}


/** INV-S6: lifecycle (experiment status) and role (champion/challenger) are orthogonal. */
function checkS6(): CheckResult {
  const cc = new ResearchChampionChallenger();
  const ch1 = { ...exp('backtest'), status: 'completed' as const, result: { metrics: { activity: 5 }, passed: true, decisions: 6, folds: [{ start: 0, end: 1, passed: true, metrics: {} }] } };
  const d1 = cc.evaluate(ch1);
  const promotedLifecycleUnchanged = d1.outcome === 'promoted-in-research' && ch1.status === 'completed';
  const ch2 = { ...exp('wfv'), status: 'completed' as const, result: { metrics: { activity: 1 }, passed: true, decisions: 2, folds: [{ start: 0, end: 1, passed: true, metrics: {} }] } };
  const d2 = cc.evaluate(ch2);
  const rejectedLifecycleUnchanged = d2.outcome === 'rejected' && ch2.status === 'completed';
  return promotedLifecycleUnchanged && rejectedLifecycleUnchanged
    ? { id: 'INV-S6', status: 'pass' }
    : { id: 'INV-S6', status: 'fail', detail: `${d1.outcome}/${d2.outcome}` };
}

export const researchChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-S3', fn: checkS3 },
  { id: 'INV-S5', fn: checkS5 },
  { id: 'INV-E1', fn: checkE1 },
  { id: 'INV-D2', fn: checkD2 },
  { id: 'INV-S6', fn: checkS6 },
];
