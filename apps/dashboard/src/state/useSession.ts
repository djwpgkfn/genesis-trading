import { useState, useCallback } from 'react';

export type ReplayDisplayState = 'LOADED' | 'PLAYING' | 'PAUSED' | 'STOPPED' | 'COMPLETED';

/** UI-local read-only cursor over a pre-computed SessionView. No engines, no side effects. */
export function useSession(total: number) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [state, setState] = useState<ReplayDisplayState>('LOADED');
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10>(1);

  const seek = useCallback((i: number) => {
    if (i >= 0 && i < total) setFrameIndex(i);
  }, [total]);
  const step = useCallback((d: 1 | -1) => {
    setFrameIndex((n) => Math.min(total - 1, Math.max(0, n + d)));
  }, [total]);
  const play = useCallback(() => setState('PLAYING'), []);
  const pause = useCallback(() => setState('PAUSED'), []);
  const stop = useCallback(() => { setState('STOPPED'); setFrameIndex(0); }, []);

  return { frameIndex, state, speed, setSpeed, seek, step, play, pause, stop };
}
