import { describe, it, expect } from 'vitest';
import { InMemoryEventStore } from '@genesis/event-engine';
import { asHash, asISOTimestamp, asSnapshotId, asVersion, asUUID, type ProductionSnapshot, type DeploymentManifest } from '@genesis/contracts';
import { ProductionRuntime } from './runtime.js';
import { SnapshotRuntime, snapshotHash, verifyPins } from './snapshot-runtime.js';
import { ControlPlane } from './control-plane.js';
import { ExecutionGateway } from './execution-gateway.js';
import { CycleOrchestrator } from './orchestrator.js';
import { MarketHealthCalculator } from './market-health.js';
import { CorrelationMatrix } from '@genesis/portfolio-engine';

function snap(id = 'snap1'): ProductionSnapshot {
  const v = asVersion('1.0.0');
  const base = {
    snapshot_id: asSnapshotId(id), strategy_versions: [{ id: 's', version: v }], feature_set_version: v,
    risk_config_version: v, portfolio_config_version: v, engine_version: v, config_ref: asHash('cfg'),
    mtf_weights_version: v, market_health_config_version: v, score_config_version: v, memory_method_version: v,
    correlation_method_version: v, fee_schedule_version: v, market_rules_version: v, timezone: 'Asia/Seoul',
    rng: 'none' as const, created_at: asISOTimestamp('2026-07-28T00:00:00.000Z'),
  };
  return { ...base, hash: asHash(snapshotHash(base)) };
}
function manifest(target: ProductionSnapshot, signed = true): DeploymentManifest {
  return {
    manifest_id: asUUID('m1'), target_snapshot: target.snapshot_id, reason: 'x',
    evidence: { wfv_ref: 'wfv-1' },
    approvals: signed ? [{ approver: 'g', role: 'gov', at: asISOTimestamp('2026-07-28T00:00:00.000Z'), signature: 'sig' }] : [],
    created_at: asISOTimestamp('2026-07-28T00:00:00.000Z'), hash: asHash('mh'),
  };
}

describe('Production runtime state', () => {
  it('cold-starts INIT→READY→RUN only', () => {
    const rt = new ProductionRuntime(new InMemoryEventStore(), () => '2026-07-28T00:00:00.000Z');
    expect(() => rt.start()).toThrow();
    rt.init(); expect(rt.state()).toBe('READY');
    rt.start(); expect(rt.state()).toBe('RUN');
  });
});

describe('Snapshot runtime + Control Plane', () => {
  it('verifies pins, activates atomically, rolls back', () => {
    const sr = new SnapshotRuntime();
    expect(verifyPins(snap()).ok).toBe(true);
    sr.activate(snap('a'));
    sr.activate(snap('b'));
    expect(sr.getActive()!.snapshot_id).toBe('b');
    sr.rollback();
    expect(sr.getActive()!.snapshot_id).toBe('a');
  });
  it('rejects deploy without signed manifest (INV-V3)', () => {
    const cp = new ControlPlane(new SnapshotRuntime());
    expect(cp.deploy(manifest(snap(), false), snap()).ok).toBe(false);
    expect(cp.deploy(manifest(snap(), true), snap()).ok).toBe(true);
  });
  it('rejects snapshot with missing pin (INV-V5)', () => {
    expect(verifyPins({ ...snap(), timezone: '' }).ok).toBe(false);
  });
});

describe('Execution Gateway', () => {
  it('rejects tokenless order (INV-R1), idempotent (INV-R7)', () => {
    const gw = new ExecutionGateway(
      { authorizeExecution: (t) => t === 'good' },
      { placeOrder: (o) => ({ client_order_id: o.client_order_id, filled_notional: o.notional, price: 1 }) },
      'c', 'snap1',
    );
    const o = { client_order_id: 'o1', symbol: 'KRW-BTC', side: 'buy' as const, notional: 100 };
    expect(gw.execute(o, 'bad').ok).toBe(false);
    expect(gw.execute(o, 'good').ok).toBe(true);
    expect(gw.execute(o, 'good').reason).toContain('idempotent'); // second time deduped
  });
});

describe('Cycle Orchestrator', () => {
  function build() {
    const gw = new ExecutionGateway({ authorizeExecution: () => true },
      { placeOrder: (o) => ({ client_order_id: o.client_order_id, filled_notional: o.notional, price: 1 }) }, 'c', 'snap1');
    return new CycleOrchestrator(
      { compute: () => ({ liquidity: 0.8, volatility: 0.2, trend: 0.6, volume: 0.7 }) },
      { candidates: () => [{ symbol: 'KRW-BTC', winProb: 0.6, payoffRatio: 2 }, { symbol: 'KRW-ETH', winProb: 0.55, payoffRatio: 1.8 }] },
      { budgetView: () => ({ total: 1000, available: 1000 }), preTradeCheck: (r) => ({ approved: true, token_id: `t-${r.symbol}`, reason: 'ok' }) },
      gw,
    );
  }
  const input = {
    snapshot_id: 'snap1',
    returns: { 'KRW-BTC': [0.01, -0.02, 0.03], 'KRW-ETH': [0.011, -0.019, 0.028] },
    constraints: { maxWeightPerSymbol: 0.2, maxCorrelationGroupExposure: 0.35, kellyFraction: 0.25, correlationThreshold: 0.8, maxTotalUtilization: 0.6 },
  };

  it('computes Market Health + correlation once (INV-A3) and event-sources the chain', () => {
    const mh0 = MarketHealthCalculator.computeCount;
    const cm0 = CorrelationMatrix.buildCount;
    const orch = build();
    const out = orch.runCycle(input);
    expect(MarketHealthCalculator.computeCount - mh0).toBe(1);
    expect(CorrelationMatrix.buildCount - cm0).toBe(1);
    expect(orch.eventLog().verifyChain()).toBe(true);
    expect(out.decision).not.toBeNull();
    expect(out.market_health.mode).toBeTruthy();
  });

  it('produces a full decision chain to Execution', () => {
    const orch = build();
    const out = orch.runCycle(input);
    const types = orch.eventLog().all().map((e) => e.event_type);
    expect(types).toContain('MarketHealth.scored');
    expect(types).toContain('Portfolio.planned');
    expect(types).toContain('Risk.decided');
    expect(out.orders.every((o) => o.executed)).toBe(true);
  });
});
