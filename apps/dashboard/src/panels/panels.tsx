import type { FrameView, SignalViewModel, DecisionHistoryItem } from '@genesis/presentation';

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
    <h2 className="mb-2 text-xs uppercase tracking-widest text-slate-400">{title}</h2>
    {children}
  </section>
);
const COLOR: Record<string, string> = { green: 'text-emerald-400', red: 'text-rose-400', amber: 'text-amber-400', grey: 'text-slate-400' };

export function MarketPanel({ m }: { m: FrameView['market'] }) {
  return (
    <Card title="Market">
      <div className="flex gap-6 text-sm">
        <span>{m.symbol}</span><span className="text-slate-400">{m.timeframe}</span>
        <span>{m.price !== null ? m.price.toLocaleString() : '—'}</span>
        <span className="text-slate-500">{m.candle_time}</span>
      </div>
    </Card>
  );
}
export function SignalPanel({ signals }: { signals: SignalViewModel[] }) {
  return (
    <Card title="Signals">
      <ul className="space-y-1 text-sm">
        {signals.map((s) => (
          <li key={s.name} className="flex justify-between gap-2"><span>{s.name}</span>
            <span className="text-slate-400">{s.direction} · c{s.confidence_pct} · s{s.strength_pct}</span></li>
        ))}
      </ul>
    </Card>
  );
}
export function StrategyPanel({ strategy }: { strategy: FrameView['strategy'] }) {
  return (
    <Card title="Strategy">
      <div className="text-sm"><div>Active: <span className="text-emerald-400">{strategy.active}</span></div>
        <div className="mt-1 text-slate-400">{strategy.scores.slice(0, 3).map((x) => `${x.name}:${x.score}`).join('  ')}</div></div>
    </Card>
  );
}
export function DecisionPanel({ d }: { d: FrameView['decision'] }) {
  return (
    <Card title="Decision">
      <div className={`text-2xl font-bold ${COLOR[d.action_color]}`}>{d.action}</div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-300">
        <span>Confidence</span><span className="text-right">{d.confidence_pct}</span>
        <span>Exp. Risk</span><span className="text-right">{d.expected_risk_pct}</span>
        <span>Exp. Reward</span><span className="text-right">{d.expected_reward_pct}</span>
        <span>RR</span><span className="text-right">{d.rr_ratio}</span>
        <span>Position</span><span className="text-right text-slate-500">{d.position_size_display}</span>
      </div>
    </Card>
  );
}
export function ExplainabilityPanel({ e }: { e: FrameView['explainability'] }) {
  return (
    <Card title="Explainability">
      <ol className="space-y-1 text-sm">
        {e.chain.map((s, i) => (<li key={i} className="flex gap-2"><span className="text-slate-500">{s.stage}</span><span>{s.detail}</span></li>))}
      </ol>
    </Card>
  );
}
export function InvariantPanel({ passed, total }: { passed: number; total: number }) {
  const green = passed === total;
  return (
    <Card title="Invariants">
      <div className="flex items-center gap-3"><span className="text-xl">{passed}/{total}</span>
        <span className={green ? 'text-emerald-400' : 'text-rose-400'}>{green ? 'GREEN' : 'RED'}</span></div>
    </Card>
  );
}
export function DecisionHistoryPanel({ history, frameIndex, onSeek }: { history: DecisionHistoryItem[]; frameIndex: number; onSeek: (i: number) => void }) {
  return (
    <Card title="Decision History">
      <ul className="max-h-48 space-y-1 overflow-auto text-sm">
        {history.map((h) => (
          <li key={h.decision_id}>
            <button type="button" onClick={() => onSeek(h.frame_index)}
              className={`flex w-full justify-between gap-2 rounded px-1 hover:bg-slate-800 ${h.frame_index === frameIndex ? 'bg-slate-800' : ''}`}>
              <span className="text-slate-500">#{h.frame_index}</span><span>{h.action}</span><span className="text-slate-400">{h.confidence_pct}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
export function ReplayPanel({
  state, frameIndex, total, speed, onPlay, onPause, onStop, onStep, onSpeed,
}: {
  state: string; frameIndex: number; total: number; speed: number;
  onPlay: () => void; onPause: () => void; onStop: () => void; onStep: (d: 1 | -1) => void; onSpeed: (s: 1 | 2 | 5 | 10) => void;
}) {
  const btn = 'rounded border border-slate-600 px-2 py-1 text-sm hover:bg-slate-800';
  return (
    <Card title={`Replay — ${state} · ${frameIndex + 1}/${total}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={onPlay}>▶</button>
        <button type="button" className={btn} onClick={onPause}>⏸</button>
        <button type="button" className={btn} onClick={onStop}>⏹</button>
        <button type="button" className={btn} onClick={() => onStep(-1)}>⏮</button>
        <button type="button" className={btn} onClick={() => onStep(1)}>⏭</button>
        <span className="mx-2 text-slate-500">speed</span>
        {[1, 2, 5, 10].map((s) => (
          <button key={s} type="button" className={`${btn} ${speed === s ? 'bg-slate-700' : ''}`} onClick={() => onSpeed(s as 1 | 2 | 5 | 10)}>{s}x</button>
        ))}
      </div>
    </Card>
  );
}
