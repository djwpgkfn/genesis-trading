import type { ProposalStatus } from './types.js';

export const VALID: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ['candidate', 'rejected'],
  candidate: ['validated', 'rejected'],
  validated: ['approved', 'rejected'],
  approved: ['archived'],
  rejected: ['archived'],
  archived: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return VALID[from].includes(to);
}
