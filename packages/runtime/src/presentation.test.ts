import { describe, it, expect } from 'vitest';
import { InMemoryEventStore, EventTypes, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { ReplayEngine } from '@genesis/replay-engine';
import { LiveDataSource, ReplayDataSource } from './data-source.js';
import { dashboardView, marketView, portfolioView, diaryView } from './views.js';
import { explainabilityView } from './explainability.js';
import { ControlPanel, type RiskControlPort } from './control.js';

const iso = (ms: number) => asISOTimestamp(new Date(ms).toISOString());
function seed(): InMemoryEventStore {
  const s = new InMemoryEventStore();
  const mk = (n: number, type: string, payload: unknown): EventInput => ({
    event_id: asUUID(`e${n}`),
    event_type: type,
    event_time: iso(n * 1000),
    ingest_time: iso(n * 1000),
    source_engine: 't',
    schema_version: 1,
    correlation_id: asCorrelationId('cycle-1'),
    snapshot_id: asSnapshotId('s1'),
    payload,
  });
  s.append(mk(1, 'State.transitioned', { machine: 'production', from: 'READY', to: 'RUN' }));
  s.append(mk(2, 'MarketHealth.scored', { mode: 'normal', score: 0.5 }));
  s.append(mk(3, 'Strategy.evaluated', { count: 2 }));
  s.append(
    mk(4, 'Portfolio.planned', {
      allocations: [{ symbol: 'KRW-BTC', notional: 100 }],
      utilization: 0.1,
    }),
  );
  s.append(mk(5, 'Risk.decided', { symbol: 'KRW-BTC', approved: true }));
  s.append(mk(6, 'Order.sent', { client_order_id: 'o1' }));
  s.append(mk(7, EventTypes.DecisionOutcome, { action: 'buy', reason: 'ok' }));
  return s;
}

describe('Presentation views (read-only projections)', () => {
  it('dashboard reflects runtime/market/utilization from events', () => {
    const d = dashboardView(new LiveDataSource(seed()));
    expect(d.runtime_state).toBe('RUN');
    expect(d.market_mode).toBe('normal');
    expect(d.utilization).toBeCloseTo(0.1, 6);
    expect(d.orders_sent).toBe(1);
    expect(d.halted).toBe(false);
  });
  it('market/portfolio/diary views project correctly', () => {
    const src = new LiveDataSource(seed());
    expect(marketView(src).mode).toBe('normal');
    expect(portfolioView(src).allocations).toHaveLength(1);
    expect(diaryView(src)[0]!.decisions).toBe(1);
  });
});

describe('Explainability View', () => {
  it('assembles the full decision chain + DecisionRecord', () => {
    const ex = explainabilityView(new LiveDataSource(seed()), 'cycle-1');
    expect(ex.timeline[0]!.event_type).toBe('MarketHealth.scored');
    expect(ex.timeline.map((t) => t.event_type)).toEqual([
      'MarketHealth.scored',
      'Strategy.evaluated',
      'Portfolio.planned',
      'Risk.decided',
      'Order.sent',
    ]);
    expect(ex.decision).not.toBeNull();
  });
});

describe('Replay Mode == Live (same UI, source swapped)', () => {
  it('renders identically from Live and Replay sources', () => {
    const store = seed();
    const replayLog = new InMemoryEventStore();
    const engine = new ReplayEngine(store, replayLog);
    const session = engine.createSession({ snapshot_id: 's1', replay_reason: 'debug' });
    engine.runToEnd(session);
    const live = dashboardView(new LiveDataSource(store));
    const replay = dashboardView(new ReplayDataSource(session));
    expect(replay).toEqual(live);
    const exLive = explainabilityView(new LiveDataSource(store), 'cycle-1');
    const exReplay = explainabilityView(new ReplayDataSource(session), 'cycle-1');
    expect(exReplay.timeline.map((t) => t.event_type)).toEqual(
      exLive.timeline.map((t) => t.event_type),
    );
  });
});

describe('Control Panel (only write surface)', () => {
  it('emergency exit routes through Risk FORCE_EXIT, not a direct order', () => {
    let forced = '';
    const risk: RiskControlPort = {
      forceExit: (r) => {
        forced = r;
      },
      run: () => {},
      stop: () => {},
    };
    const cp = new ControlPanel(risk);
    cp.run('op');
    cp.stop('op');
    cp.emergencyExit('op', 'panic');
    expect(forced).toBe('panic');
    expect((cp as unknown as Record<string, unknown>).placeOrder).toBeUndefined();
    expect(
      cp
        .eventLog()
        .all()
        .every((e) => e.event_type === 'ControlCommand.issued'),
    ).toBe(true);
    expect(cp.eventLog().count()).toBe(3);
  });
});
