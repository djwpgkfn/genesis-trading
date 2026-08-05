import { projectDecision } from '@genesis/event-engine';
import type { StoredEvent } from '@genesis/event-engine';
import type { DecisionRecord } from '@genesis/contracts';
import type { UIDataSource } from './data-source.js';

const latestPayload = (
  evts: readonly StoredEvent[],
  type: string,
): Record<string, unknown> | null => {
  for (let i = evts.length - 1; i >= 0; i--)
    if (evts[i]!.event_type === type) return evts[i]!.payload as Record<string, unknown>;
  return null;
};
const dayOf = (e: StoredEvent): string => String(e.event_time).slice(0, 10);

export interface DashboardView {
  runtime_state: string;
  market_mode: string | null;
  utilization: number | null;
  orders_sent: number;
  halted: boolean;
}
export function dashboardView(src: UIDataSource): DashboardView {
  const evts = src.events();
  let runtime = 'INIT';
  let halted = false;
  for (const e of evts) {
    if (e.event_type === 'State.transitioned') {
      const p = e.payload as { machine: string; to: string };
      if (p.machine === 'production') runtime = p.to;
      if (p.to === 'HALT') halted = true;
    }
  }
  const mh = latestPayload(evts, 'MarketHealth.scored');
  const pf = latestPayload(evts, 'Portfolio.planned');
  return {
    runtime_state: runtime,
    market_mode: mh ? String(mh['mode']) : null,
    utilization: pf ? Number(pf['utilization']) : null,
    orders_sent: evts.filter((e) => e.event_type === 'Order.sent').length,
    halted,
  };
}

export function marketView(src: UIDataSource): { mode: string | null; score: number | null } {
  const mh = latestPayload(src.events(), 'MarketHealth.scored');
  return { mode: mh ? String(mh['mode']) : null, score: mh ? Number(mh['score']) : null };
}

export function portfolioView(src: UIDataSource): {
  allocations: unknown[];
  utilization: number | null;
} {
  const pf = latestPayload(src.events(), 'Portfolio.planned');
  return {
    allocations: pf ? (pf['allocations'] as unknown[]) : [],
    utilization: pf ? Number(pf['utilization']) : null,
  };
}

export function strategyView(src: UIDataSource): { evaluations: unknown[] } {
  return {
    evaluations: src
      .events()
      .filter((e) => e.event_type === 'Strategy.evaluated')
      .map((e) => e.payload),
  };
}

export function aiView(src: UIDataSource): { proposals: unknown[]; artifacts: unknown[] } {
  const e = src.events();
  return {
    proposals: e.filter((x) => x.event_type === 'AI.proposalCreated').map((x) => x.payload),
    artifacts: e.filter((x) => x.event_type === 'AI.artifactFrozen').map((x) => x.payload),
  };
}

export interface DiaryEntry {
  date: string;
  decisions: number;
  halted: boolean;
}
export function diaryView(src: UIDataSource): DiaryEntry[] {
  const byDay = new Map<string, DiaryEntry>();
  for (const e of src.events()) {
    const d = dayOf(e);
    const entry = byDay.get(d) ?? { date: d, decisions: 0, halted: false };
    if (e.event_type === 'Risk.decided') entry.decisions++;
    if (e.event_type === 'State.transitioned' && (e.payload as { to: string }).to === 'HALT')
      entry.halted = true;
    byDay.set(d, entry);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** All DecisionRecords (projection) grouped by correlation_id. */
export function decisionRecords(src: UIDataSource): DecisionRecord[] {
  const byCorr = new Map<string, StoredEvent[]>();
  for (const e of src.events()) {
    const arr = byCorr.get(String(e.correlation_id)) ?? [];
    arr.push(e);
    byCorr.set(String(e.correlation_id), arr);
  }
  const out: DecisionRecord[] = [];
  for (const evs of byCorr.values()) {
    const d = projectDecision(evs);
    if (d) out.push(d);
  }
  return out;
}
