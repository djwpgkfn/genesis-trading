import type { AIProposal, ProposalKind } from './types.js';

export interface AgentInput {
  input_refs: string[]; // hashed, as-of, read-only
  model_version: string;
  prompt_version: string;
  now: () => string;
}

/** A sub-AI produces ONLY its own proposal kind; it never mutates another agent's output. */
export interface SubAI {
  readonly kind: ProposalKind;
  propose(id: string, input: AgentInput): AIProposal;
}

function base(
  id: string,
  kind: ProposalKind,
  input: AgentInput,
  content: unknown,
  rationale: string,
): AIProposal {
  return {
    proposal_id: id,
    kind,
    status: 'draft',
    content,
    rationale,
    provenance: {
      model_version: input.model_version,
      prompt_version: input.prompt_version,
      input_refs: input.input_refs,
    },
    provenance_signature: `sig:${input.model_version}:${input.input_refs.join(',')}`,
    created_at: input.now(),
  };
}

export const MarketAI: SubAI = {
  kind: 'market-analysis',
  propose: (id, i) =>
    base(
      id,
      'market-analysis',
      i,
      { marketHealthConfig: { weights: { liquidity: 0.3 } } },
      'regime + Market Health config proposal',
    ),
};
export const StrategyAI: SubAI = {
  kind: 'strategy',
  propose: (id, i) =>
    base(
      id,
      'strategy',
      i,
      { hypothesis: 'trend-follow fits current regime' },
      'strategy recommendation → hypothesis',
    ),
};
export const ParameterAI: SubAI = {
  kind: 'parameter',
  propose: (id, i) =>
    base(
      id,
      'parameter',
      i,
      { params: { kellyFraction: 0.25 } },
      'parameter proposal within DNA bounds',
    ),
};
export const ReportAI: SubAI = {
  kind: 'report',
  propose: (id, i) =>
    base(
      id,
      'report',
      i,
      { narrative: 'human-readable market diary draft' },
      'report (no decision impact)',
    ),
};

export const SUB_AIS: readonly SubAI[] = [MarketAI, StrategyAI, ParameterAI, ReportAI];
