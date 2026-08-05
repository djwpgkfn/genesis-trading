import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { CorrelationMatrix } from './correlation.js';
import { optimize } from './optimizer.js';
import type { Allocation, PortfolioInput, PortfolioPlan } from './types.js';

/**
 * Portfolio Engine: optimizes ONLY within the injected Risk envelope (never bypasses Risk).
 * Correlation is computed ONCE per optimize() and shared to all consumers (INV-A3).
 * Deterministic → identical in Replay and Live. Emits PortfolioPlanned (Event Sourcing).
 */
export class PortfolioEngine {
  private seq = 0;
  constructor(
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly now: () => string = () => new Date(0).toISOString(),
  ) {}

  eventLog(): EventStore {
    return this.log;
  }

  optimize(input: PortfolioInput): PortfolioPlan {
    // Single-source correlation for this cycle.
    const corr = CorrelationMatrix.build(input.returns);
    const { weights, explain } = optimize(input.candidates, corr, input.constraints, input.budget);

    const allocations: Allocation[] = [];
    let totalNotional = 0;
    for (const [symbol, weight] of [...weights.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const notional = weight * input.budget.total;
      allocations.push({ symbol, weight, notional });
      totalNotional += notional;
    }

    // Hard clip: never exceed Risk available budget (INV-R5).
    if (totalNotional > input.budget.available && totalNotional > 0) {
      const scale = input.budget.available / totalNotional;
      for (const a of allocations) {
        a.weight *= scale;
        a.notional *= scale;
      }
      totalNotional = input.budget.available;
    }
    for (const e of explain) {
      const a = allocations.find((x) => x.symbol === e.symbol);
      if (a) {
        e.final_weight = a.weight;
        e.notional = a.notional;
      }
    }

    const plan: PortfolioPlan = {
      snapshot_id: input.snapshot_id,
      objective: 'long-term-survival',
      allocations,
      total_notional: totalNotional,
      utilization: input.budget.total > 0 ? totalNotional / input.budget.total : 0,
      explain,
    };
    this.emit(input.snapshot_id, plan);
    return plan;
  }

  private emit(snapshotId: string, plan: PortfolioPlan): void {
    const input: EventInput = {
      event_id: asUUID(`portfolio-planned-${++this.seq}`),
      event_type: 'Portfolio.planned',
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'portfolio-engine',
      schema_version: 1,
      correlation_id: asCorrelationId(`cycle-${this.seq}`),
      snapshot_id: asSnapshotId(snapshotId),
      payload: plan,
    };
    this.log.append(input);
  }
}
