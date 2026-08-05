import { ReplayEngine, type ReplaySession } from '@genesis/replay-engine';
import type { EventStore, StoredEvent } from '@genesis/event-engine';
import { AlertSystem, type AlertType } from './alerts.js';
import { StructuredLogger } from './logging.js';

export interface IncidentReport {
  incident_id: string;
  at: string;
  trigger: AlertType;
  snapshot_id: string;
  replay_session_id: string;
  decision_ids: string[];
  summary: string;
}

/**
 * On failure: (1) capture the active Snapshot id, (2) auto-create a Replay Session over the
 * incident window (reusing S4 — read-only, side-effect-free / INV-E3), (3) collect linked
 * DecisionRecord ids, (4) emit an Incident Report. Uses only existing deterministic mechanisms;
 * nothing here mutates the event log or influences decisions.
 */
export class FailureAutomation {
  private n = 0;
  constructor(
    private readonly sourceLog: EventStore,
    private readonly replayLog: EventStore,
    private readonly alerts: AlertSystem,
    private readonly logger: StructuredLogger,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  onFailure(trigger: AlertType, activeSnapshotId: string, message: string): { report: IncidentReport; session: ReplaySession } {
    const incident_id = `incident-${++this.n}`;
    this.alerts.raise(trigger, 'failure-automation', message);

    // Auto Replay Session around the incident (whole log; window can be narrowed by seq/as-of).
    const engine = new ReplayEngine(this.sourceLog, this.replayLog);
    const session = engine.createSession({ snapshot_id: activeSnapshotId, replay_reason: 'bug-repro' });
    engine.runToEnd(session);

    const decision_ids = engine.decisions(session).map((d) => String(d.decision_id));
    const report: IncidentReport = {
      incident_id, at: this.now(), trigger, snapshot_id: activeSnapshotId,
      replay_session_id: session.session_id, decision_ids, summary: message,
    };
    this.logger.error(`incident ${incident_id}: ${trigger}`, { replay_id: session.session_id, snapshot_id: activeSnapshotId }, { decision_ids });
    return { report, session };
  }
}

/** Utility: which correlation ids appear in a window (for narrowing incident scope). */
export function correlationsIn(events: readonly StoredEvent[]): string[] {
  return [...new Set(events.map((e) => String(e.correlation_id)))];
}
