export type AlertType =
  | 'ws_disconnect'
  | 'rest_rate_limit'
  | 'db_failure'
  | 'snapshot_activate_fail'
  | 'replay_fail'
  | 'risk_halt'
  | 'exchange_mismatch';
export type AlertSeverity = 'warning' | 'critical';

export interface Alert {
  type: AlertType;
  severity: AlertSeverity;
  component: string;
  message: string;
  ts: string;
}
export type AlertHandler = (a: Alert) => void;

const DEFAULT_SEVERITY: Record<AlertType, AlertSeverity> = {
  ws_disconnect: 'warning',
  rest_rate_limit: 'warning',
  db_failure: 'critical',
  snapshot_activate_fail: 'critical',
  replay_fail: 'warning',
  risk_halt: 'critical',
  exchange_mismatch: 'critical',
};

export class AlertSystem {
  private readonly handlers: AlertHandler[] = [];
  private readonly log: Alert[] = [];
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  on(handler: AlertHandler): void {
    this.handlers.push(handler);
  }

  raise(type: AlertType, component: string, message: string, severity?: AlertSeverity): Alert {
    const a: Alert = {
      type,
      severity: severity ?? DEFAULT_SEVERITY[type],
      component,
      message,
      ts: this.now(),
    };
    this.log.push(a);
    for (const h of this.handlers) h(a);
    return a;
  }
  history(): readonly Alert[] {
    return this.log;
  }
}
