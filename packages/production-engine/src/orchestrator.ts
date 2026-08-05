import {
  InMemoryEventStore,
  type EventStore,
  type EventInput,
  projectDecision,
} from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import type { DecisionRecord } from '@genesis/contracts';
import {
  CorrelationMatrix,
  optimize,
  type Candidate,
  type PortfolioConstraints,
} from '@genesis/portfolio-engine';
import { MarketHealthCalculator, type MarketHealth } from './market-health.js';
import { ExecutionGateway, type Order } from './execution-gateway.js';

/** Engine ports — the orchestrator is the ONLY caller. Engines never call each other (INV-A1/A2). */
export interface FeaturePort {
  compute(): { liquidity: number; volatility: number; trend: number; volume: number };
}
export interface StrategyPort {
  candidates(mh: MarketHealth): Candidate[];
}
export interface RiskPort {
  budgetView(): { total: number; available: number };
  preTradeCheck(req: {
    request_id: string;
    symbol: string;
    side: 'buy' | 'sell';
    notional: number;
  }): { approved: boolean; token_id?: string; reason: string };
}

export interface CycleInput {
  snapshot_id: string;
  returns: Record<string, number[]>;
  constraints: PortfolioConstraints;
}

export interface CycleOutcome {
  correlation_id: string;
  market_health: MarketHealth;
  decision: DecisionRecord | null;
  orders: { order: Order; approved: boolean; executed: boolean }[];
}

/**
 * The one place engines are sequenced: Feature → (Market Health) → Strategy → Portfolio → Risk →
 * Execution. Market Health and Correlation are each computed ONCE per cycle and shared (INV-A3).
 * budget_view is fetched from Risk and INJECTED into Portfolio (Portfolio never calls Risk — F1).
 */
export class CycleOrchestrator {
  private cycle = 0;
  constructor(
    private readonly features: FeaturePort,
    private readonly strategy: StrategyPort,
    private readonly risk: RiskPort,
    private readonly gateway: ExecutionGateway,
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly now: () => string = () => new Date(0).toISOString(),
  ) {}

  eventLog(): EventStore {
    return this.log;
  }

  runCycle(input: CycleInput): CycleOutcome {
    const correlation_id = `cycle-${++this.cycle}`;
    const emit = (type: string, payload: unknown): void =>
      this.emit(type, correlation_id, input.snapshot_id, payload);

    // 1) Feature (once) → 2) Market Health (ONCE) → mode
    const feat = this.features.compute();
    const mh = MarketHealthCalculator.compute(feat);
    emit('MarketHealth.scored', mh);

    // 3) Correlation (ONCE, single source)
    const corr = CorrelationMatrix.build(input.returns);

    // 4) Strategy candidates
    const candidates = this.strategy.candidates(mh);
    emit('Strategy.evaluated', { count: candidates.length, mode: mh.mode });

    // 5) Portfolio within injected Risk budget_view (Portfolio never calls Risk)
    const budget = this.risk.budgetView();
    const { weights } = optimize(candidates, corr, input.constraints, budget);
    const allocations = [...weights.entries()]
      .map(([symbol, w]) => ({ symbol, notional: w * budget.total }))
      .filter((a) => a.notional > 0)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    emit('Portfolio.planned', {
      allocations,
      utilization: allocations.reduce((s, a) => s + a.notional, 0) / (budget.total || 1),
    });

    // 6) Risk gate per order → 7) Execution gateway (token required)
    const orders: CycleOutcome['orders'] = [];
    for (const a of allocations) {
      const req = {
        request_id: `${correlation_id}:${a.symbol}`,
        symbol: a.symbol,
        side: 'buy' as const,
        notional: a.notional,
      };
      const decision = this.risk.preTradeCheck(req);
      emit('Risk.decided', {
        symbol: a.symbol,
        approved: decision.approved,
        reason: decision.reason,
      });
      const order: Order = {
        client_order_id: req.request_id,
        symbol: a.symbol,
        side: 'buy',
        notional: a.notional,
      };
      let executed = false;
      if (decision.approved && decision.token_id) {
        const r = this.gateway.execute(order, decision.token_id);
        executed = r.ok;
      }
      orders.push({ order, approved: decision.approved, executed });
    }

    // 8) Explainability: assemble the full decision chain into a DecisionRecord
    const chainEvents = this.log.byCorrelation(correlation_id);
    const decision = projectDecision(chainEvents);
    return { correlation_id, market_health: mh, decision, orders };
  }

  private emit(type: string, corr: string, snap: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`orch-${type}-${corr}`),
      event_type: type,
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'cycle-orchestrator',
      schema_version: 1,
      correlation_id: asCorrelationId(corr),
      snapshot_id: asSnapshotId(snap),
      payload,
    };
    this.log.append(input);
  }
}
