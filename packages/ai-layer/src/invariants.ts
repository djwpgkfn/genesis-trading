import type { CheckResult } from '@genesis/invariant-runner';
import { AILayer } from './platform.js';
import { AI_CAPABILITIES } from './isolation.js';
import { freezeProposal, isProductionEligible } from './frozen-artifact.js';
import type { AIProposal } from './types.js';

function validatedProposal(): AIProposal {
  const ai = new AILayer();
  const p = ai.propose('parameter', ['ref1']);
  ai.transition(p.proposal_id, 'candidate');
  return ai.transition(p.proposal_id, 'validated');
}

/** INV-D3: AI has no Data-Plane/LLM execution path; capabilities all false. */
function checkD3(): CheckResult {
  const ai = new AILayer();
  const noExec = (ai as unknown as Record<string, unknown>)['execute'] === undefined
    && (ai as unknown as Record<string, unknown>)['placeOrder'] === undefined;
  const capsFalse = Object.values(AI_CAPABILITIES).every((v) => v === false);
  return noExec && capsFalse && AI_CAPABILITIES.dataPlaneLLM === false
    ? { id: 'INV-D3', status: 'pass' }
    : { id: 'INV-D3', status: 'fail' };
}

/** INV-S3: AI runtime has no account/order/risk/execution/exchange access. */
function checkS3(): CheckResult {
  const ok = !AI_CAPABILITIES.account && !AI_CAPABILITIES.orderApi && !AI_CAPABILITIES.risk
    && !AI_CAPABILITIES.execution && !AI_CAPABILITIES.exchange;
  return ok ? { id: 'INV-S3', status: 'pass' } : { id: 'INV-S3', status: 'fail' };
}

/** INV-V3: a frozen artifact is Production-eligible only with an approval signature (signed Manifest). */
function checkV3(): CheckResult {
  const p = validatedProposal();
  const artifact = freezeProposal(p, '1.0.0');
  const beforeSign = isProductionEligible(artifact); // false — AI cannot self-approve
  const afterSign = isProductionEligible({ ...artifact, approval_signature: 'gov-sig' });
  return !beforeSign && afterSign ? { id: 'INV-V3', status: 'pass' } : { id: 'INV-V3', status: 'fail' };
}

/** INV-V5: frozen artifact records provenance (model/prompt/artifact versions + input refs). */
function checkV5(): CheckResult {
  const p = validatedProposal();
  const a = freezeProposal(p, '2.0.0');
  const pv = a.provenance;
  const ok = !!pv.model_version && !!pv.prompt_version && pv.artifact_version === '2.0.0' && pv.input_refs.length > 0 && !!a.content_hash;
  return ok ? { id: 'INV-V5', status: 'pass' } : { id: 'INV-V5', status: 'fail' };
}

export const aiLayerChecks: ReadonlyArray<{ id: string; fn: () => CheckResult }> = [
  { id: 'INV-D3', fn: checkD3 },
  { id: 'INV-S3', fn: checkS3 },
  { id: 'INV-V3', fn: checkV3 },
  { id: 'INV-V5', fn: checkV5 },
];
