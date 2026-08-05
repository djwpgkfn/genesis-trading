export type ProposalKind = 'market-analysis' | 'strategy' | 'parameter' | 'report';
export type ProposalStatus = 'draft' | 'candidate' | 'validated' | 'approved' | 'rejected' | 'archived';

export interface Provenance {
  model_version: string;
  prompt_version: string;
  artifact_version: string;
  input_refs: string[]; // hashed as-of inputs
}

export interface AIProposal {
  proposal_id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  content: unknown;        // structured proposal (config/params/analysis/report)
  rationale: string;
  provenance: Omit<Provenance, 'artifact_version'>;
  provenance_signature: string; // "produced by AI run X from inputs Y"
  created_at: string;
}

export interface FrozenArtifact {
  artifact_id: string;
  version: string;
  type: ProposalKind;
  derived_from: string;   // proposal_id
  content: unknown;       // frozen (static) config — consumed by deterministic engines, no LLM at runtime
  content_hash: string;
  provenance: Provenance;
  approval_signature?: string; // set ONLY via signed Manifest (governance) — not by AI
}
