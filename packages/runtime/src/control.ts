import { InMemoryEventStore, type EventStore, type EventInput } from '@genesis/event-engine';
import { asUUID, asISOTimestamp, asCorrelationId, asSnapshotId } from '@genesis/contracts';

export type ControlCommandKind = 'run' | 'stop' | 'emergency_exit';

/** Emergency exit routes through Risk's FORCE_EXIT path — NEVER a direct order from the UI. */
export interface RiskControlPort {
  forceExit(reason: string): void; // adapter over Risk Engine (S6) — assembled, not modified
  run(): void;
  stop(): void;
}

/**
 * The UI's ONLY write surface. It emits ControlCommand events and delegates to the Risk control
 * port. It has NO order/placeOrder method — the UI cannot trade directly (INV-E: read-only + control).
 */
export class ControlPanel {
  private n = 0;
  constructor(
    private readonly risk: RiskControlPort,
    private readonly log: EventStore = new InMemoryEventStore(),
    private readonly now: () => string = () => new Date(0).toISOString(),
  ) {}

  eventLog(): EventStore {
    return this.log;
  }

  run(operator: string): void {
    this.risk.run();
    this.emit('run', operator, {});
  }
  stop(operator: string): void {
    this.risk.stop();
    this.emit('stop', operator, {});
  }
  /** Emergency liquidation request → Risk FORCE_EXIT (not a direct order). */
  emergencyExit(operator: string, reason: string): void {
    this.risk.forceExit(reason); // Risk-authorized path only
    this.emit('emergency_exit', operator, { reason });
  }

  private emit(kind: ControlCommandKind, operator: string, extra: Record<string, unknown>): void {
    const input: EventInput = {
      event_id: asUUID(`ctrl-${kind}-${++this.n}`), event_type: 'ControlCommand.issued',
      event_time: asISOTimestamp(this.now()), ingest_time: asISOTimestamp(this.now()),
      source_engine: 'presentation', schema_version: 1,
      correlation_id: asCorrelationId('control'), snapshot_id: asSnapshotId('control'),
      payload: { kind, operator, ...extra },
    };
    this.log.append(input);
  }
}
