import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import {
  SignalEngine,
  SignalEvents,
  type MarketSnapshot,
  type SignalSet,
} from '@genesis/signal-engine';
import { StrategyEngine, StrategyEvents, type StrategyDecision } from '@genesis/strategy-engine';
import { DecisionEngine } from './engine.js';
import { DecisionEvents } from './events.js';
import type { Decision, PortfolioSnapshot, RiskSnapshot } from './types.js';

export interface TradingCoreResult {
  signals: SignalSet;
  strategy: StrategyDecision;
  decision: Decision | null; // null when no signals (INV-TC4: no decision without signals)
}

/**
 * Trading Core pipeline: Market Snapshot → Signals → Strategy → Decision.
 * The composition emits SignalCreated / StrategySelected / DecisionCreated; the engines stay pure
 * (INV-A1: engines don't call each other). No orders, no execution.
 */
export class TradingCore {
  private n = 0;
  constructor(
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly signalEngine: SignalEngine = new SignalEngine(),
    private readonly strategyEngine: StrategyEngine = new StrategyEngine(),
    private readonly decisionEngine: DecisionEngine = new DecisionEngine(),
    private readonly now: () => string = () => new Date(0).toISOString(),
  ) {}

  eventLog(): EventStore {
    return this.log;
  }

  run(
    snapshot: MarketSnapshot,
    risk: RiskSnapshot,
    portfolio: PortfolioSnapshot,
  ): TradingCoreResult {
    const corr = `tc-${snapshot.timestamp_ms}`;
    const signals = this.signalEngine.generate(snapshot);
    this.emit(SignalEvents.SignalCreated, corr, snapshot.symbol, {
      count: signals.length,
      signals,
    });

    const strategy = this.strategyEngine.select(signals);
    this.emit(StrategyEvents.StrategySelected, corr, snapshot.symbol, {
      active: strategy.active,
      selected: strategy.selected,
    });

    let decision: Decision | null = null;
    if (signals.length > 0) {
      decision = this.decisionEngine.decide(strategy, signals, risk, portfolio, {
        symbol: snapshot.symbol,
        timestamp_ms: snapshot.timestamp_ms,
      });
      this.emit(DecisionEvents.DecisionCreated, corr, snapshot.symbol, decision);
    }
    return { signals, strategy, decision };
  }

  private emit(type: string, corr: string, snap: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`${type}-${corr}-${++this.n}`),
      event_type: type,
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'trading-core',
      schema_version: 1,
      correlation_id: asCorrelationId(corr),
      snapshot_id: asSnapshotId(snap),
      payload,
    };
    this.log.append(input);
  }
}
