import { projectDecision } from '@genesis/event-engine';
import type { DecisionRecord } from '@genesis/contracts';
import type { UIDataSource } from './data-source.js';

/** Canonical drill-down order of a decision cycle. */
const CHAIN_ORDER = [
  'MarketHealth.scored',
  'Feature.computed',
  'Strategy.evaluated',
  'Portfolio.planned',
  'Risk.decided',
  'Order.sent',
  'Fill.received',
] as const;

export interface TimelineStep { stage: string; event_type: string; seq: number; event_time: string; payload: unknown }
export interface ExplainabilityView {
  correlation_id: string;
  timeline: TimelineStep[];
  decision: DecisionRecord | null;
  ai_explanation: unknown | null;
}

/**
 * Assembles the full chain for one decision cycle:
 * Market Health → Feature → Strategy → Portfolio → Risk → Execution → DecisionRecord → AI Explanation.
 * Pure read-only projection over events — identical in Live and Replay.
 */
export function explainabilityView(src: UIDataSource, correlationId: string): ExplainabilityView {
  const events = src.events().filter((e) => String(e.correlation_id) === correlationId);
  const order = new Map<string, number>(CHAIN_ORDER.map((t, i) => [t, i] as [string, number]));
  const timeline: TimelineStep[] = events
    .filter((e) => order.has(e.event_type))
    .sort((a, b) => (order.get(a.event_type)! - order.get(b.event_type)!) || a.seq - b.seq)
    .map((e) => ({ stage: e.event_type.split('.')[0]!, event_type: e.event_type, seq: e.seq, event_time: String(e.event_time), payload: e.payload }));

  const decision = projectDecision(events);
  const aiEvt = src.events().find(
    (e) => e.event_type === 'AI.reportGenerated' &&
      (e.payload as { decision_record_id?: string }).decision_record_id === decision?.decision_id,
  );
  return { correlation_id: correlationId, timeline, decision, ai_explanation: aiEvt ? aiEvt.payload : null };
}
