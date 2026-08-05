import type { RecordedFrame } from '@genesis/replay-engine';
import { decisionViewModel, type DecisionViewModel } from './viewmodels/decision-vm.js';
import { signalViewModels, type SignalViewModel } from './viewmodels/signal-vm.js';
import { strategyViewModel, type StrategyViewModel } from './viewmodels/strategy-vm.js';
import {
  explainabilityViewModel,
  type ExplainabilityViewModel,
} from './viewmodels/explainability-vm.js';
import { decisionHistory, type DecisionHistoryItem } from './viewmodels/replay-vm.js';

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
export function frameView(frame: RecordedFrame): FrameView {
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
export function buildSessionView(frames: readonly RecordedFrame[]): SessionView {
  return { frames: frames.map(frameView), history: decisionHistory(frames) };
}
