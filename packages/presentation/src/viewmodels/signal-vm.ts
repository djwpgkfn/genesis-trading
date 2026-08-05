import type { Signal } from '@genesis/signal-engine';

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export interface SignalViewModel {
  name: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  confidence_pct: string;
  strength_pct: string;
  source: string[];
  timestamp_ms: number;
}

/** Pure mapper: Signal → display shape. Direction is read from value sign (no recomputation). */
export function signalViewModel(s: Signal): SignalViewModel {
  return {
    name: s.name,
    direction: s.value > 0 ? 'BUY' : s.value < 0 ? 'SELL' : 'HOLD',
    confidence_pct: pct(s.confidence),
    strength_pct: pct(s.strength),
    source: [...s.source],
    timestamp_ms: s.timestamp_ms,
  };
}
export const signalViewModels = (list: readonly Signal[]): SignalViewModel[] =>
  list.map(signalViewModel);
