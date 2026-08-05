import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';
import { AIEventTypes } from './ai-events.js';
import { canTransition } from './proposal-lifecycle.js';
import { SUB_AIS } from './agents.js';
import { AIMemory } from './ai-memory.js';
import { freezeProposal } from './frozen-artifact.js';
import { AI_CAPABILITIES } from './isolation.js';
import type { AIProposal, FrozenArtifact, ProposalKind, ProposalStatus } from './types.js';

/** A minimal Research sink — the ONLY outbound path for AI artifacts (to S5, never Production). */
export interface ResearchSink {
  submitArtifact(a: FrozenArtifact): void;
}

/**
 * AI Coordinator + Layer. Advisory only. Structurally isolated: exposes no execution/order/risk/
 * exchange method (INV-S3, INV-D3). Frozen artifacts flow to Research ONLY (INV: no direct
 * Production interface). All lifecycle transitions are event-sourced.
 */
export class AILayer {
  readonly capabilities = AI_CAPABILITIES; // all false
  private readonly proposals = new Map<string, AIProposal>();
  readonly memory = new AIMemory();
  private n = 0;

  constructor(
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly now: () => string = () => new Date(0).toISOString(),
  ) {}

  eventLog(): EventStore {
    return this.log;
  }
  getProposal(id: string): AIProposal | undefined {
    return this.proposals.get(id);
  }

  /** A sub-AI drafts a proposal (Draft). */
  propose(
    kind: ProposalKind,
    input_refs: string[],
    model_version = 'm1',
    prompt_version = 'p1',
  ): AIProposal {
    const agent = SUB_AIS.find((a) => a.kind === kind);
    if (!agent) throw new Error(`no agent for ${kind}`);
    const id = `prop-${++this.n}`;
    const p = agent.propose(id, { input_refs, model_version, prompt_version, now: this.now });
    this.proposals.set(id, p);
    this.memory.recordProposal(p);
    this.emit(AIEventTypes.ProposalCreated, id, p);
    return p;
  }

  /** Advance lifecycle with an event (Draft→Candidate→Validated→Approved/Rejected→Archived). */
  transition(id: string, to: ProposalStatus): AIProposal {
    const p = this.proposals.get(id);
    if (!p) throw new Error(`unknown proposal ${id}`);
    if (!canTransition(p.status, to))
      throw new Error(`invalid proposal transition ${p.status} → ${to}`);
    const updated = { ...p, status: to };
    this.proposals.set(id, updated);
    this.emit(AIEventTypes.ProposalTransitioned, id, { from: p.status, to });
    if (to === 'validated') this.emit(AIEventTypes.ProposalValidated, id, { proposal_id: id });
    return updated;
  }

  /** Freeze a VALIDATED proposal → frozen artifact (hash + provenance). Records ArtifactFrozen. */
  freeze(id: string, artifact_version = '1.0.0'): FrozenArtifact {
    const p = this.proposals.get(id);
    if (!p) throw new Error(`unknown proposal ${id}`);
    if (p.status !== 'validated' && p.status !== 'approved') {
      throw new Error('only validated/approved proposals can be frozen');
    }
    const artifact = freezeProposal(p, artifact_version);
    this.emit(AIEventTypes.ArtifactFrozen, id, {
      artifact_id: artifact.artifact_id,
      hash: artifact.content_hash,
    });
    return artifact;
  }

  /** Hand a frozen artifact to Research (S5) — the ONLY outbound path. NO Production access. */
  submitToResearch(artifact: FrozenArtifact, research: ResearchSink): void {
    research.submitArtifact(artifact);
  }

  /** Report generation (category B — no decision impact). */
  generateReport(content: unknown, decisionRecordId?: string): void {
    this.emit(AIEventTypes.ReportGenerated, 'report', {
      content,
      decision_record_id: decisionRecordId ?? null,
    });
  }

  private emit(type: string, corr: string, payload: unknown): void {
    const input: EventInput = {
      event_id: asUUID(`ai-${type}-${corr}-${this.log.count() + 1}`),
      event_type: type,
      event_time: asISOTimestamp(this.now()),
      ingest_time: asISOTimestamp(this.now()),
      source_engine: 'ai-layer',
      schema_version: 1,
      correlation_id: asCorrelationId(corr),
      snapshot_id: asSnapshotId('ai'),
      payload,
    };
    this.log.append(input);
  }
}
