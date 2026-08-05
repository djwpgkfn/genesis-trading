import type { RawStore } from '@genesis/data-layer';
import type {
  TradingCore,
  TradingCoreResult,
  RiskSnapshot,
  PortfolioSnapshot,
} from '@genesis/decision-engine';
import { systemNowMs } from '@genesis/contracts';
import { buildMarketSnapshot } from './snapshot.js';

export type RiskProvider = (asOfMs: number) => RiskSnapshot;
export type PortfolioProvider = (asOfMs: number) => PortfolioSnapshot;

export interface LiveRuntimeOptions {
  symbol: string;
  tfMs?: number;
  candleCount?: number;
  now?: () => number; // injected clock — replay overrides with a frozen clock
  risk?: RiskProvider; // real risk-engine wiring: P0-3
  portfolio?: PortfolioProvider; // real portfolio-engine wiring: P0-3
}

const defaultRisk: RiskProvider = () => ({ budget_available: 1_000_000, halted: false });
const defaultPortfolio: PortfolioProvider = () => ({ exposure: 0, max_exposure: 1_000_000 });

/**
 * Live runtime loop: RawStore → MarketSnapshot → TradingCore.run() on a schedule.
 * Deterministic: each tick reads the store as-of the injected clock and runs the pure Trading Core;
 * identical records + clock ⇒ identical decisions (Replay == Live). TradingCore appends the
 * Signal/Strategy/Decision events. No orders, no execution.
 */
export class LiveRuntime {
  private timer: ReturnType<typeof setInterval> | null = null;
  private last: TradingCoreResult | null = null;
  private readonly now: () => number;
  private readonly risk: RiskProvider;
  private readonly portfolio: PortfolioProvider;

  constructor(
    private readonly store: RawStore,
    private readonly core: TradingCore,
    private readonly opts: LiveRuntimeOptions,
  ) {
    this.now = opts.now ?? systemNowMs;
    this.risk = opts.risk ?? defaultRisk;
    this.portfolio = opts.portfolio ?? defaultPortfolio;
  }

  /** One deterministic cycle. Returns the result; events are appended by TradingCore. */
  tick(): TradingCoreResult {
    const asOf = this.now();
    const snapshot = buildMarketSnapshot(
      this.store.all(),
      this.opts.symbol,
      asOf,
      this.opts.tfMs,
      this.opts.candleCount,
    );
    const result = this.core.run(snapshot, this.risk(asOf), this.portfolio(asOf));
    this.last = result;
    return result;
  }

  start(intervalMs: number): void {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (e) {
        void e; // scheduling side-channel; failures surface via events/logs, not the loop
      }
    }, intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  lastResult(): TradingCoreResult | null {
    return this.last;
  }
}
