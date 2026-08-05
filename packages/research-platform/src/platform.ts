import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId } from '@genesis/contracts';
import { ResearchEventTypes } from './research-events.js';
import { ExperimentRunner } from './experiment.js';
import type { Experiment, Hypothesis, Proposal } from './types.js';

/**
 * Research Platform: isolated (virtual-only), event-sourced. Proposal/Hypothesis/Experiment/Result
 * are all recorded as events (append-only) → reproducible. No real-account access exists here.
 */
export class ResearchPlatform {
  constructor(
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly runner: ExperimentRunner = new ExperimentRunner(),
    private readonly now: () => string = () => new Date(0).toISOString(),
  ) {}

  private emit(type: string, corr: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`rp-${type}-${corr}-${this.log.count() + 1}`),
      event_type: type,
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'research-platform',
      schema_version: 1,
      correlation_id: asCorrelationId(corr),
      payload,
    };
    this.log.append(input);
  }

  eventLog(): EventStore {
    return this.log;
  }

  createProposal(p: Proposal): Proposal {
    this.emit(ResearchEventTypes.ProposalCreated, p.proposal_id, p);
    return p;
  }
  registerHypothesis(h: Hypothesis): Hypothesis {
    this.emit(ResearchEventTypes.HypothesisRegistered, h.hypothesis_id, h);
    return h;
  }

  /** Run an experiment (backtest/paper/shadow or WFV) over a source event log; records events. */
  runExperiment(
    exp: Experiment,
    sourceLog: EventStore,
    hypothesis: Hypothesis,
    wfvFolds?: number,
  ): Experiment {
    this.emit(ResearchEventTypes.ExperimentStarted, exp.experiment_id, {
      experiment_id: exp.experiment_id,
      mode: exp.mode,
    });
    try {
      const result =
        exp.mode === 'wfv'
          ? this.runner.runWFV(exp, sourceLog, hypothesis, wfvFolds ?? 4)
          : this.runner.run(exp, sourceLog, hypothesis);
      const done: Experiment = { ...exp, status: 'completed', result };
      this.emit(ResearchEventTypes.ResultRecorded, exp.experiment_id, {
        experiment_id: exp.experiment_id,
        result,
      });
      this.emit(ResearchEventTypes.ExperimentCompleted, exp.experiment_id, {
        experiment_id: exp.experiment_id,
        passed: result.passed,
      });
      return done;
    } catch (err) {
      this.emit(ResearchEventTypes.ExperimentFailed, exp.experiment_id, {
        experiment_id: exp.experiment_id,
        error: String(err),
      });
      return { ...exp, status: 'failed' };
    }
  }

  recordPromotion(decision: unknown, corr: string): void {
    this.emit(ResearchEventTypes.PromotionEvaluated, corr, decision);
  }
}
