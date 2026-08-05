import { SESSION } from './fixtures/session.js';
import { useSession } from './state/useSession.js';
import {
  MarketPanel, SignalPanel, StrategyPanel, DecisionPanel, ExplainabilityPanel,
  InvariantPanel, DecisionHistoryPanel, ReplayPanel,
} from './panels/panels.js';

// Read-only AI Decision Viewer. Consumes ViewModel DTOs only. No BUY/SELL/order/execution.
export function App() {
  const total = SESSION.frames.length;
  const { frameIndex, state, speed, setSpeed, seek, step, play, pause, stop } = useSession(total);
  const f = SESSION.frames[frameIndex]!;
  return (
    <div className="min-h-screen p-4">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-wide">Genesis · Operator Console</h1>
        <span className="text-xs uppercase tracking-widest text-amber-400">Read Only — AI Decision Viewer</span>
      </header>
      <MarketPanel m={f.market} />
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SignalPanel signals={f.signals} /><StrategyPanel strategy={f.strategy} /><DecisionPanel d={f.decision} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <ExplainabilityPanel e={f.explainability} /><InvariantPanel passed={45} total={45} />
        <DecisionHistoryPanel history={SESSION.history} frameIndex={frameIndex} onSeek={seek} />
      </div>
      <div className="mt-3">
        <ReplayPanel state={state} frameIndex={frameIndex} total={total} speed={speed}
          onPlay={play} onPause={pause} onStop={stop} onStep={step} onSpeed={setSpeed} />
      </div>
    </div>
  );
}
