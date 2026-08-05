import type { Projection, StoredEvent } from '@genesis/event-engine';
import { ReplayEventTypes } from './replay-events.js';

export interface ReplayAudit {
  session_id?: string;
  snapshot_id?: string;
  fromSeq?: number;
  toSeq?: number;
  replay_reason?: string;
  pauses: number;
  resumes: number;
  seeks: number;
  finished: boolean;
  failed: boolean;
  final_state_hash?: string;
  applied?: number;
  error?: string;
}

/** Projection over the REPLAY event log → audit metadata (traceable from events). */
export const replayAuditProjection: Projection<ReplayAudit> = {
  name: 'replay-audit',
  version: '1',
  initial: () => ({ pauses: 0, resumes: 0, seeks: 0, finished: false, failed: false }),
  apply: (s, e: StoredEvent): ReplayAudit => {
    const p = e.payload as Record<string, unknown>;
    switch (e.event_type) {
      case ReplayEventTypes.Started:
        return {
          ...s,
          session_id: String(p['session_id']),
          snapshot_id: String(p['snapshot_id']),
          fromSeq: Number(p['fromSeq']),
          toSeq: Number(p['toSeq']),
          replay_reason: String(p['replay_reason']),
        };
      case ReplayEventTypes.Paused:
        return { ...s, pauses: s.pauses + 1 };
      case ReplayEventTypes.Resumed:
        return { ...s, resumes: s.resumes + 1 };
      case ReplayEventTypes.Seeked:
        return { ...s, seeks: s.seeks + 1 };
      case ReplayEventTypes.Finished:
        return {
          ...s,
          finished: true,
          final_state_hash: String(p['final_state_hash']),
          applied: Number(p['applied']),
        };
      case ReplayEventTypes.Failed:
        return { ...s, failed: true, error: String(p['error']) };
      default:
        return s;
    }
  },
};

export interface AuditReport extends ReplayAudit {
  decisions_count: number;
}

/** Build an audit report from replay events (projection) + session-derived decision count. */
export function buildAuditReport(audit: ReplayAudit, decisionsCount: number): AuditReport {
  return { ...audit, decisions_count: decisionsCount };
}
