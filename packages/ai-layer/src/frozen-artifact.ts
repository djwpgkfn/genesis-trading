import { contentHash } from '@genesis/event-engine';
import type { AIProposal, FrozenArtifact } from './types.js';

/**
 * Compile a VALIDATED proposal into a frozen (static) config artifact. Reproducibility comes from
 * this frozen artifact + a deterministic runtime — NOT from re-running the LLM. model/prompt are
 * recorded as provenance only (INV-V5). approval_signature is set later via a signed Manifest.
 */
export function freezeProposal(p: AIProposal, artifact_version: string): FrozenArtifact {
  const content = p.content; // deterministic pass-through; real compile normalizes to a static schema
  const provenance = {
    model_version: p.provenance.model_version,
    prompt_version: p.provenance.prompt_version,
    artifact_version,
    input_refs: p.provenance.input_refs,
  };
  const body = { type: p.kind, derived_from: p.proposal_id, content, provenance };
  return {
    artifact_id: `artifact:${p.proposal_id}`,
    version: artifact_version,
    type: p.kind,
    derived_from: p.proposal_id,
    content,
    content_hash: contentHash(body),
    provenance,
  };
}

/** Production-eligible ONLY when an approval signature (from a signed Manifest) is present (INV-V3). */
export function isProductionEligible(a: FrozenArtifact): boolean {
  return !!a.approval_signature;
}
