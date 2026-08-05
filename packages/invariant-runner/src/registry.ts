// Invariant Registry v1 — IDs & statements only. Actual check functions are implemented per-stage (S1+).
export type InvariantCategory = 'D' | 'T' | 'R' | 'V' | 'S' | 'E' | 'A' | 'TC';

export interface InvariantSpec {
  id: string;
  category: InvariantCategory;
  statement: string;
}

// Registered here so CI can enumerate coverage. Checks are wired in later stages.
export const INVARIANTS: ReadonlyArray<InvariantSpec> = [
  {
    id: 'INV-D1',
    category: 'D',
    statement: 'Deterministic engines: same input + snapshot => same output.',
  },
  {
    id: 'INV-D2',
    category: 'D',
    statement: 'Every decision reproducible from active snapshot + as-of data.',
  },
  { id: 'INV-D3', category: 'D', statement: 'No LLM call in the execution loop.' },
  { id: 'INV-T1', category: 'T', statement: 'All data access is as-of; no look-ahead.' },
  {
    id: 'INV-T2',
    category: 'T',
    statement: 'Scores/features use closed candles only (no repaint).',
  },
  { id: 'INV-T3', category: 'T', statement: 'Memory reads are past-only as-of.' },
  { id: 'INV-T4', category: 'T', statement: 'L2/L3/L4/Feature/Memory regenerable from L1.' },
  {
    id: 'INV-R1',
    category: 'R',
    statement: 'No order executes without a valid Risk approval token.',
  },
  { id: 'INV-R2', category: 'R', statement: 'Approval token is single-use; invalidated on HALT.' },
  { id: 'INV-R3', category: 'R', statement: 'HALT is latching; RUN only via explicit approval.' },
  { id: 'INV-R4', category: 'R', statement: 'reserved + consumed <= total budget (always).' },
  { id: 'INV-R5', category: 'R', statement: 'Orders/weights stay within Risk envelope/budget.' },
  { id: 'INV-R6', category: 'R', statement: 'System position == exchange position (else HALT).' },
  { id: 'INV-R7', category: 'R', statement: 'Orders are idempotent (no duplicate sends).' },
  { id: 'INV-R8', category: 'R', statement: 'No cold-start into RUN (start HALT/RECOVERY).' },
  {
    id: 'INV-R9',
    category: 'R',
    statement:
      'Deterministic Replay: recompute under frozen clock == stored Decision (Replay==Live).',
  },
  {
    id: 'INV-R10',
    category: 'R',
    statement: 'Replay/restore is side-effect-free: no external I/O, no trading events emitted.',
  },
  {
    id: 'INV-R11',
    category: 'R',
    statement: 'Replay transport (speed/seek/step) changes only cursor/state, never frame content.',
  },
  { id: 'INV-V1', category: 'V', statement: 'Versions immutable; change = new version.' },
  { id: 'INV-V2', category: 'V', statement: 'Snapshot swapped atomically (no partial swap).' },
  { id: 'INV-V3', category: 'V', statement: 'No production deploy without signed manifest.' },
  { id: 'INV-V4', category: 'V', statement: 'Rollback is atomic to a prior snapshot.' },
  { id: 'INV-V5', category: 'V', statement: 'Snapshot pins every decision-affecting version.' },
  {
    id: 'INV-S1',
    category: 'S',
    statement: 'Transitions only within Contracts §3 state machines.',
  },
  { id: 'INV-S2', category: 'S', statement: 'Every transition is recorded as an event.' },
  {
    id: 'INV-S3',
    category: 'S',
    statement: 'Research has no real-order/account access (isolation).',
  },
  {
    id: 'INV-S4',
    category: 'S',
    statement: 'Champion swap: evidence-gated, atomic, rollbackable.',
  },
  {
    id: 'INV-S5',
    category: 'S',
    statement: 'No promotion past Paper/Production without WFV pass.',
  },
  {
    id: 'INV-S6',
    category: 'S',
    statement: 'Lifecycle and role (Champion/Challenger) are orthogonal.',
  },
  {
    id: 'INV-E1',
    category: 'E',
    statement: 'All state changes appended to event log; chain intact.',
  },
  {
    id: 'INV-E2',
    category: 'E',
    statement: 'Every order/hold/stop/strategy-change explained by a DecisionRecord.',
  },
  {
    id: 'INV-E3',
    category: 'E',
    statement: 'Event replay is side-effect-free (no external re-emit).',
  },
  {
    id: 'INV-E4',
    category: 'E',
    statement: 'DecisionRecord is a deterministic projection, back-traceable.',
  },
  {
    id: 'INV-E5',
    category: 'E',
    statement: 'Decision-class events carry correlation_id + snapshot_id.',
  },
  {
    id: 'INV-E6',
    category: 'E',
    statement: 'Presentation mappers are pure: same input yields deep-equal ViewModel (PR1).',
  },
  {
    id: 'INV-E7',
    category: 'E',
    statement:
      'Presentation has no business logic: ViewModels only re-shape final Decision fields (PR2).',
  },
  {
    id: 'INV-A1',
    category: 'A',
    statement: 'Dependency graph is a DAG; engines do not call each other directly.',
  },
  { id: 'INV-A2', category: 'A', statement: 'Risk never calls Strategy/Portfolio (one-way).' },
  {
    id: 'INV-A3',
    category: 'A',
    statement: 'Market Health & correlation computed once/cycle and shared.',
  },
  {
    id: 'INV-TC1',
    category: 'TC',
    statement: 'Trading Core: every Signal carries a confidence in [0,1] with basis features.',
  },
  {
    id: 'INV-TC2',
    category: 'TC',
    statement: 'Trading Core: strategy selection yields at least one strategy.',
  },
  {
    id: 'INV-TC3',
    category: 'TC',
    statement: 'Trading Core: a Decision requires a selected strategy.',
  },
  {
    id: 'INV-TC4',
    category: 'TC',
    statement: 'Trading Core: a Decision requires at least one signal.',
  },
  {
    id: 'INV-TC5',
    category: 'TC',
    statement: 'Trading Core: Decision confidence is within [0,1].',
  },
  {
    id: 'INV-TC6',
    category: 'TC',
    statement: 'Trading Core: every Decision carries an explainability trace.',
  },
];
