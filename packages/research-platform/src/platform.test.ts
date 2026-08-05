import { describe, it, expect } from 'vitest';
import { InMemoryEventStore, EventTypes, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { ResearchPlatform } from './platform.js';
import { ExperimentRunner } from './experiment.js';
import { ResearchChampionChallenger } from './champion-challenger.js';
import { makeVirtualExecution } from './isolation.js';
import type { Experiment, Hypothesis } from './types.js';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());
function marketLog(): InMemoryEventStore {
  const s = new InMemoryEventStore();
  for (let n = 1; n <= 6; n++) {
    const e: EventInput = {
      event_id: asUUID(`e${n}`),
      event_type: EventTypes.DecisionOutcome,
      event_time: iso(n * 1000),
      ingest_time: iso(n * 1000),
      source_engine: 't',
      schema_version: 1,
      correlation_id: asCorrelationId(`c${n}`),
      snapshot_id: asSnapshotId('s1'),
      payload: { action: n % 2 ? 'buy' : 'sell', reason: 'x' },
    };
    s.append(e);
  }
  return s;
}
const hyp: Hypothesis = {
  hypothesis_id: 'h1',
  statement: 'active',
  success_criteria: { activity: 1 },
  status: 'testing',
};
const exp = (mode: Experiment['mode']): Experiment => ({
  experiment_id: `x-${mode}`,
  hypothesis_id: 'h1',
  snapshot_id: 'snap1',
  strategy_version: '1.0.0',
  feature_set_version: '1.0.0',
  dataset: 'ds1',
  period: { start: 0, end: 7000 },
  mode,
  status: 'created',
  provenance: { created_by: 't', method_version: '1', created_at: iso(0) },
});

describe('Research Platform', () => {
  it('runs backtest reproducibly (INV-D2) and event-sources it (INV-E1)', () => {
    const rp = new ResearchPlatform();
    const src = marketLog();
    const done = rp.runExperiment(exp('backtest'), src, hyp);
    expect(done.status).toBe('completed');
    expect(done.result!.passed).toBe(true);
    expect(rp.eventLog().verifyChain()).toBe(true);
    // reproducible
    const r2 = new ExperimentRunner().run(exp('backtest'), src, hyp);
    expect(r2.metrics).toEqual(done.result!.metrics);
  });

  it('one execution model handles all modes', () => {
    const runner = new ExperimentRunner();
    const src = marketLog();
    for (const m of ['backtest', 'paper', 'shadow'] as const) {
      expect(runner.run(exp(m), src, hyp).passed).toBe(true);
    }
    expect(runner.runWFV(exp('wfv'), src, hyp, 3).folds).toHaveLength(3);
  });

  it('execution is virtual-only (INV-S3)', () => {
    expect(makeVirtualExecution().mode).toBe('virtual');
  });

  it('champion/challenger stays Research-internal and requires WFV', () => {
    const cc = new ResearchChampionChallenger();
    const bt = {
      ...exp('backtest'),
      status: 'completed' as const,
      result: { metrics: { activity: 5 }, passed: true, decisions: 6 },
    };
    expect(cc.evaluate(bt).outcome).toBe('rejected'); // no WFV
    const wfv = {
      ...exp('wfv'),
      status: 'completed' as const,
      result: new ExperimentRunner().runWFV(exp('wfv'), marketLog(), hyp, 3),
    };
    const d = cc.evaluate(wfv);
    expect(d.outcome).toBe('promoted-in-research'); // never 'promoted-to-production'
    expect(cc.getChampion()!.experiment_id).toBe('x-wfv');
  });
});
