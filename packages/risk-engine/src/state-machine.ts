import { emitTransition, currentState as deriveState, type EventStore } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId } from '@genesis/contracts';
import type { RiskState } from './types.js';

const MACHINE = 'risk';

/** Allowed transitions. HALT is latching: exits only via RECOVERY. FROZEN is terminal. */
export const VALID: Record<RiskState, readonly RiskState[]> = {
  INIT: ['READY'],
  READY: ['RUN'],
  RUN: ['SAFE_MODE', 'HALT'],
  SAFE_MODE: ['RUN', 'HALT'],
  HALT: ['RECOVERY'],
  RECOVERY: ['READY', 'HALT', 'FROZEN'],
  FROZEN: [],
};

export function canTransition(from: RiskState, to: RiskState): boolean {
  return VALID[from].includes(to);
}

/** State is derived ONLY from events (INV-S2). Reuses event-engine State.transitioned. */
export class RiskStateMachine {
  private counter = 0;
  constructor(private readonly store: EventStore, private readonly now: () => string) {}

  current(): RiskState {
    return (deriveState(this.store, MACHINE) as RiskState | null) ?? 'INIT';
  }

  transition(to: RiskState): void {
    const from = this.current();
    if (!canTransition(from, to)) {
      throw new Error(`Invalid risk transition ${from} → ${to} (INV-S1)`);
    }
    emitTransition(
      this.store,
      { machine: MACHINE, from, to },
      {
        event_id: asUUID(`risk-transition-${++this.counter}`),
        at: asISOTimestamp(this.now()),
        correlation_id: asCorrelationId('risk'),
        source_engine: 'risk-engine',
      },
    );
  }
}
