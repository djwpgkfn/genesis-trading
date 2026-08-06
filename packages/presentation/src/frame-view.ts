import type { FrameInput } from './input-dto.js';
import { decisionViewModel, type DecisionViewModel } from './viewmodels/decision-vm.js';
import { signalViewModels, type SignalViewModel } from './viewmodels/signal-vm.js';
import { strategyViewModel, type StrategyViewModel } from './viewmodels/strategy-vm.js';
import {
  explainabilityViewModel,
  type ExplainabilityViewModel,
} from './viewmodels/explainability-vm.js';
import { decisionHistory, type DecisionHistoryItem } from './viewmodels/replay-vm.js';
import {
  invariantViewModel,
  type InvariantViewModel,
  type InvariantReport,
} from './viewmodels/invariant-vm.js';

export interface MarketView {
  symbol: string;
  timeframe: string;
  price: number | null;
  candle_time: string;
}
export interface FrameView {
  index: number;
  market: MarketView;
  signals: SignalViewModel[];
  strategy: StrategyViewModel;
  decision: DecisionViewModel;
  explainability: ExplainabilityViewModel;
}
export interface SessionView {
  frames: FrameView[];
  history: DecisionHistoryItem[];
}

/** Pure mapper: a recorded frame → fully display-ready FrameView (no engine at consume time). */
export function frameView(frame: FrameInput): FrameView {
  const last = frame.snapshot.candles[frame.snapshot.candles.length - 1];
  return {
    index: frame.index,
    market: {
      symbol: frame.snapshot.symbol,
      timeframe: '1m',
      price: last ? last.close : null,
      candle_time: new Date(frame.snapshot.timestamp_ms).toISOString(),
    },
    signals: signalViewModels(frame.signals),
    strategy: strategyViewModel(frame.strategy),
    decision: decisionViewModel(frame.decision),
    explainability: explainabilityViewModel(frame.decision),
  };
}

/** Pure mapper: recorded frames → a fully serialized SessionView the UI can consume directly. */
export function buildSessionView(frames: readonly FrameInput[]): SessionView {
  return { frames: frames.map(frameView), history: decisionHistory(frames) };
}

/** Full explainability panel (#5): Signal, Strategy, Decision, Risk Budget, Reject Reason,
 *  Invariant Status, Timestamp — all derived from the runtime snapshot + invariant report. */
export interface ExplainabilityDetail {
  timestamp: string;
  action: string;
  confidence_pct: string;
  signals: string[];
  strategy: string;
  decision: string;
  risk_budget: number;
  reject_reason: string | null;
  invariant_status: string;
  chain: { stage: string; detail: string; refs: string[] }[];
}

/** Pure mapper: runtime frame (+ invariant report) → full explainability detail. */
export function explainabilityDetail(
  frame: FrameInput,
  report: InvariantReport,
): ExplainabilityDetail {
  const base = explainabilityViewModel(frame.decision);
  const inv = invariantViewModel(report);
  const rejected = frame.decision.action === 'HOLD' || frame.decision.action === 'WAIT';
  return {
    timestamp: new Date(frame.timestamp_ms).toISOString(),
    action: frame.decision.action,
    confidence_pct: base.confidence_pct,
    signals: frame.signals.map((s) => s.name),
    strategy: frame.strategy.active,
    decision: frame.decision.action,
    risk_budget: frame.risk.budget_available,
    reject_reason: rejected ? frame.decision.reason : null,
    invariant_status: `${inv.label} ${inv.status}`,
    chain: base.chain,
  };
}

/** Top-level dashboard view for a single frame: all panels, display-ready. */
export interface DashboardView {
  index: number;
  market: MarketView;
  signals: SignalViewModel[];
  strategy: StrategyViewModel;
  decision: DecisionViewModel;
  explainability: ExplainabilityDetail;
  invariant: InvariantViewModel;
}

/** Pure mapper: runtime frame (+ invariant report) → DashboardView. */
export function dashboardView(frame: FrameInput, report: InvariantReport): DashboardView {
  const fv = frameView(frame);
  return {
    index: fv.index,
    market: fv.market,
    signals: fv.signals,
    strategy: fv.strategy,
    decision: fv.decision,
    explainability: explainabilityDetail(frame, report),
    invariant: invariantViewModel(report),
  };
}

/** Runtime → Presentation bridge (#2): recorded frames + invariant report → serializable DTO.
 *  Live and Replay call this SAME function with the SAME ViewModels (#6). */
export interface DashboardSessionView {
  frames: DashboardView[];
  history: DecisionHistoryItem[];
}
export function presentSession(
  frames: readonly FrameInput[],
  report: InvariantReport,
): DashboardSessionView {
  return { frames: frames.map((f) => dashboardView(f, report)), history: decisionHistory(frames) };
}
