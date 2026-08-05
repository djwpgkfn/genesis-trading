// AI Layer events (internal; Contracts unchanged — RFC-001/002 would formalize into System Contracts).
export const AIEventTypes = {
  ProposalCreated: 'AI.proposalCreated',
  ProposalTransitioned: 'AI.proposalTransitioned',
  ProposalValidated: 'AI.proposalValidated',
  ArtifactFrozen: 'AI.artifactFrozen',
  ReportGenerated: 'AI.reportGenerated',
} as const;
