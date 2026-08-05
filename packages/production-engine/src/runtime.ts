import { emitTransition, currentState as derive, type EventStore } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId } from '@genesis/contracts';

export type RuntimeState = 'INIT' | 'READY' | 'RUN' | 'SAFE_MODE' | 'HALT' | 'RECOVERY' | 'FROZEN';
const MACHINE = 'production';

export const VALID: Record<RuntimeState, readonly RuntimeState[]> = {
  INIT: ['READY'],
  READY: ['RUN'],
  RUN: ['SAFE_MODE', 'HALT'],
  SAFE_MODE: ['RUN', 'HALT'],
  HALT: ['RECOVERY'],
  RECOVERY: ['READY', 'HALT', 'FROZEN'],
  FROZEN: [],
};

/** Production runtime state. State derived ONLY from State.transitioned events (INV-S2). */
export class ProductionRuntime {
  private n = 0;
  constructor(
    private readonly store: EventStore,
    private readonly now: () => string,
  ) {}
  state(): RuntimeState {
    return (derive(this.store, MACHINE) as RuntimeState | null) ?? 'INIT';
  }
  transition(to: RuntimeState): void {
    const from = this.state();
    if (!VALID[from].includes(to)) throw new Error(`Invalid production transition ${from} → ${to}`);
    emitTransition(
      this.store,
      { machine: MACHINE, from, to },
      {
        event_id: asUUID(`prod-tr-${++this.n}`),
        at: asISOTimestamp(this.now()),
        correlation_id: asCorrelationId('production'),
        source_engine: 'production-engine',
      },
    );
  }
  init(): void {
    this.transition('READY');
  } // INIT → READY (cold start; never direct RUN)
  start(): void {
    this.transition('RUN');
  } // READY → RUN (explicit)
}
