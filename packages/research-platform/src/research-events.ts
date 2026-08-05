// Research artifacts (Proposal/Hypothesis/Experiment/Result) are all Event-Sourced. Internal types.
export const ResearchEventTypes = {
  ProposalCreated: 'Research.proposalCreated',
  HypothesisRegistered: 'Research.hypothesisRegistered',
  ExperimentStarted: 'Research.experimentStarted',
  ExperimentCompleted: 'Research.experimentCompleted',
  ExperimentFailed: 'Research.experimentFailed',
  ResultRecorded: 'Research.resultRecorded',
  PromotionEvaluated: 'Research.promotionEvaluated', // Research-internal only (NOT Production)
} as const;
