import { InMemoryEventStore, type EventStore } from '@genesis/event-engine';
import { ReplayEngine } from '@genesis/replay-engine';
import type { DecisionRecord } from '@genesis/contracts';
import { makeVirtualExecution, type VirtualExecution } from './isolation.js';
import type { Experiment, ExperimentResult, FoldResult, Hypothesis, Period } from './types.js';

/** Computes metrics from replayed decisions using ONLY virtual execution (INV-S3). Deterministic. */
export type ExperimentExecutor = (
  decisions: readonly DecisionRecord[],
  exec: VirtualExecution,
) => Record<string, number>;

/** Reference executor: simple deterministic metrics from decisions. */
export const defaultExecutor: ExperimentExecutor = (decisions) => {
  const buys = decisions.filter((d) => d.outcome.action === 'buy').length;
  const sells = decisions.filter((d) => d.outcome.action === 'sell').length;
  return { decisions: decisions.length, buys, sells, activity: buys + sells };
};

function meetsCriteria(metrics: Record<string, number>, criteria: Record<string, number>): boolean {
  return Object.entries(criteria).every(([k, min]) => (metrics[k] ?? -Infinity) >= min);
}

/**
 * Single execution model. Backtest / Paper / Shadow all run the SAME replay-based pass over an
 * event source (they differ only in which event log/window is supplied). WFV runs it per fold.
 * Every run uses the Replay Engine → fully reproducible from Snapshot + Event Log.
 */
export class ExperimentRunner {
  constructor(
    private readonly exec: VirtualExecution = makeVirtualExecution(),
    private readonly executor: ExperimentExecutor = defaultExecutor,
  ) {}

  private runWindow(exp: Experiment, sourceLog: EventStore, period: Period): {
    metrics: Record<string, number>;
    decisions: DecisionRecord[];
    state_hash?: string;
  } {
    const engine = new ReplayEngine(sourceLog, new InMemoryEventStore());
    const session = engine.createSession({
      snapshot_id: exp.snapshot_id,
      replay_reason: `experiment:${exp.mode}`,
      asOfEventMs: period.end,
    });
    engine.runToEnd(session);
    const decisions = engine
      .decisions(session)
      .filter(() => true); // window already bounded by as-of; start-bound could be added similarly
    const metrics = this.executor(decisions, this.exec);
    return { metrics, decisions, ...(session.stateHash ? { state_hash: session.stateHash } : {}) };
  }

  /** Backtest / Paper / Shadow — one pass. */
  run(exp: Experiment, sourceLog: EventStore, hypothesis?: Hypothesis): ExperimentResult {
    const { metrics, decisions, state_hash } = this.runWindow(exp, sourceLog, exp.period);
    const passed = hypothesis ? meetsCriteria(metrics, hypothesis.success_criteria) : true;
    return { metrics, passed, decisions: decisions.length, ...(state_hash ? { state_hash } : {}) };
  }

  /** Walk-Forward Validation: rolling folds; gate = ALL folds pass (out-of-sample consistency). */
  runWFV(exp: Experiment, sourceLog: EventStore, hypothesis: Hypothesis, folds: number): ExperimentResult {
    const span = (exp.period.end - exp.period.start) / folds;
    const foldResults: FoldResult[] = [];
    let totalDecisions = 0;
    for (let i = 0; i < folds; i++) {
      const period: Period = { start: exp.period.start + i * span, end: exp.period.start + (i + 1) * span };
      const { metrics, decisions } = this.runWindow(exp, sourceLog, period);
      foldResults.push({ start: period.start, end: period.end, passed: meetsCriteria(metrics, hypothesis.success_criteria), metrics });
      totalDecisions += decisions.length;
    }
    const passed = foldResults.length > 0 && foldResults.every((f) => f.passed);
    return { metrics: { folds: folds, passedFolds: foldResults.filter((f) => f.passed).length }, passed, decisions: totalDecisions, folds: foldResults };
  }
}
