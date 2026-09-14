import { describe, it, expect, vi } from 'vitest';
import { runPaperCycle, runPaperSession, paperRisk } from './pipeline.js';
import { PaperPortfolio } from './portfolio.js';
import { bullishCandles, bearishCandles, flatCandles, snapshotOf, FIXTURE_SYMBOL } from './market-fixture.js';
import { FakeWsTransport } from './fake-ws.js';
import { SignalEngine } from '@genesis/signal-engine';

describe('I4-7B-2b: deterministic market fixture drives the REAL indicator math', () => {
  it('rising candles produce real bullish signals (engines unmodified)', () => {
    const signals = new SignalEngine().generate(snapshotOf(bullishCandles(30)));
    expect(signals.length).toBeGreaterThan(0);
    const names = signals.map((s) => s.name);
    expect(names).toContain('TREND_UP');
    expect(names).toContain('EMA_CROSS');
    // net direction is positive → BUY side
    const net = signals.reduce((a, s) => a + s.value * s.strength * s.confidence, 0);
    expect(net).toBeGreaterThan(0);
  });

  it('bearish candles produce real trend-down signals from the same engines', () => {
    const signals = new SignalEngine().generate(snapshotOf(bearishCandles(30)));
    expect(signals.length).toBeGreaterThan(0);
    const names = signals.map((s) => s.name);
    expect(names).toContain('TREND_DOWN');
    // Net conviction is whatever the real engines compute — this fixture also triggers
    // RSI_OVERSOLD, so we assert the bearish trend signal itself rather than the aggregate sign.
    const down = signals.find((s) => s.name === 'TREND_DOWN')!;
    expect(down.value).toBe(-1);
  });
});

describe('I4-7B-2b: FakeWsTransport implements the real WsTransport interface', () => {
  it('delivers deterministic candles without any network', async () => {
    const ws = new FakeWsTransport();
    const received: unknown[] = [];
    ws.onMessage((m) => received.push(m.data));
    await ws.connect();
    await ws.subscribe();
    ws.emitSeries(bullishCandles(3));
    expect(ws.connectCount).toBe(1);
    expect(received).toHaveLength(3);
    await ws.close();
    expect(ws.closed).toBe(true);
  });
});

describe('I4-7B-2b: full paper pipeline (every contract hop asserted)', () => {
  it('rising market → Decision BUY → sized → risk approved → ACK → fill → reconcile → portfolio', async () => {
    const risk = paperRisk();
    const pf = new PaperPortfolio();
    const r = await runPaperCycle(risk, pf, { candles: bullishCandles(30) });

    // Decision hop
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.decision.action).toBe('BUY');
    expect(r.decision.symbol).toBe(FIXTURE_SYMBOL);

    // Sizing hop: requested_notional is exactly what the bridge computed
    expect(r.sized.sized).not.toBeNull();
    const request = r.sized.sized!.request;
    expect(request.notional).toBeGreaterThan(0);

    // Risk + gateway hops
    expect(r.approved).toBe(true);
    expect(r.submission_ok).toBe(true);
    expect(r.adapter_calls).toBe(1); // exactly one venue submission, via the gateway

    // Fill + reconciliation hops
    expect(r.fills).toHaveLength(1);
    expect(r.filled_notional).toBe(request.notional);
    expect(r.final_status).toBe('FILLED');

    // Portfolio reflects the actual fill
    const pos = pf.position(FIXTURE_SYMBOL)!;
    expect(pos.notional).toBe(request.notional);
    expect(pos.qty).toBeCloseTo(r.fills[0]!.filled_qty, 10);
  });

  it('partial fill → PARTIALLY_FILLED, portfolio holds only the filled amount', async () => {
    const risk = paperRisk();
    const pf = new PaperPortfolio();
    const first = await runPaperCycle(risk, pf, { candles: bullishCandles(30), fillPlan: { kind: 'none' } });
    const requested = first.sized.sized!.request.notional;
    const filled = Math.floor(requested * 0.6);

    const risk2 = paperRisk();
    const pf2 = new PaperPortfolio();
    const r = await runPaperCycle(risk2, pf2, {
      candles: bullishCandles(30),
      fillPlan: { kind: 'partial', filled },
    });
    expect(r.final_status).toBe('PARTIALLY_FILLED');
    expect(r.filled_notional).toBe(filled);
    expect(pf2.position(FIXTURE_SYMBOL)!.notional).toBe(filled); // only the filled part
  });

  it('duplicate fill delivery is deduped — portfolio is not double counted', async () => {
    const risk = paperRisk();
    const pf = new PaperPortfolio();
    const r = await runPaperCycle(risk, pf, { candles: bullishCandles(30), duplicateFills: true });
    expect(r.fills).toHaveLength(1); // deduped by trade_uuid
    expect(pf.position(FIXTURE_SYMBOL)!.notional).toBe(r.sized.sized!.request.notional);
  });

  it('multi-fill accrues to the requested notional', async () => {
    const risk = paperRisk();
    const pf = new PaperPortfolio();
    const probe = await runPaperCycle(paperRisk(), new PaperPortfolio(), {
      candles: bullishCandles(30), fillPlan: { kind: 'none' },
    });
    const n = probe.sized.sized!.request.notional;
    const parts = [Math.floor(n / 2), n - Math.floor(n / 2)];
    const r = await runPaperCycle(risk, pf, { candles: bullishCandles(30), fillPlan: { kind: 'multi', parts } });
    expect(r.fills).toHaveLength(2);
    expect(r.filled_notional).toBe(n);
    expect(r.final_status).toBe('FILLED');
  });
});

describe('I4-7B-2b: negative and safety scenarios', () => {
  it('flat market → HOLD → no order is sized or submitted', async () => {
    const risk = paperRisk();
    const pf = new PaperPortfolio();
    const r = await runPaperCycle(risk, pf, { candles: flatCandles(30) });
    expect(['HOLD', 'WAIT']).toContain(r.decision.action);
    expect(r.sized.sized).toBeNull();
    expect(r.approved).toBe(false);
    expect(r.adapter_calls).toBe(0); // venue never touched
    expect(pf.positions()).toHaveLength(0);
  });

  it('venue rejection → fail closed, nothing filled, portfolio untouched', async () => {
    const risk = paperRisk();
    const pf = new PaperPortfolio();
    const r = await runPaperCycle(risk, pf, { candles: bullishCandles(30), venueMode: 'reject' });
    expect(r.submission_ok).toBe(false);
    expect(r.filled_notional).toBe(0);
    expect(r.final_status).toBe('REJECTED');
    expect(pf.positions()).toHaveLength(0);
  });

  it('venue throw → gateway fails closed, no exception escapes, portfolio untouched', async () => {
    const risk = paperRisk();
    const pf = new PaperPortfolio();
    const r = await runPaperCycle(risk, pf, { candles: bullishCandles(30), venueMode: 'throw' });
    expect(r.submission_ok).toBe(false);
    expect(r.final_status).toBe('REJECTED');
    expect(pf.positions()).toHaveLength(0);
  });

  it('risk rejection (no budget) → no venue submission', async () => {
    const risk = paperRisk(1); // budget far below any order
    const pf = new PaperPortfolio();
    const r = await runPaperCycle(risk, pf, { candles: bullishCandles(30) });
    expect(r.approved).toBe(false);
    expect(r.adapter_calls).toBe(0);
    expect(pf.positions()).toHaveLength(0);
  });

  it('no network call happens anywhere in a full cycle', async () => {
    const spy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation((() => {
      throw new Error('network must not be used in paper trading');
    }) as never);
    const r = await runPaperCycle(paperRisk(), new PaperPortfolio(), { candles: bullishCandles(30) });
    expect(r.final_status).toBe('FILLED');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('I4-7B-2b: session metrics', () => {
  it('aggregates a multi-cycle session with real_orders 0 and a consistent budget', async () => {
    const m = await runPaperSession([
      { candles: bullishCandles(30) },
      { candles: bullishCandles(30), duplicateFills: true },
      { candles: flatCandles(30) },
      { candles: bullishCandles(30), venueMode: 'reject' },
    ]);
    expect(m.cycles).toBe(4);
    expect(m.real_orders).toBe(0);
    expect(m.exceptions).toBe(0);
    expect(m.budget_consistent).toBe(true);
    expect(m.gateway_bypassed).toBe(false);
    expect(m.orders_submitted).toBeGreaterThan(0);
    expect(m.fills_full).toBeGreaterThan(0);
    expect(m.paper_portfolio_final_state.length).toBeGreaterThan(0);
  });
});
