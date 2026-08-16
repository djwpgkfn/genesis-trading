import {
  presentSession,
  dashboardView,
  decisionHistory,
  type FrameInput,
  type DashboardSessionView,
  type PresentationPatch,
} from '@genesis/presentation';
import type { InvariantReport } from '@genesis/presentation';

/** Structural push target — BrowserAdapter satisfies this. Runtime never references Browser directly. */
export interface PushSink {
  pushSnapshot(payload: unknown): boolean;
  pushUpdate(payload: unknown): boolean;
}

/**
 * Push-driven bridge: Runtime recorded frames -> Presentation Snapshot + Incremental Patch -> sink.
 * No polling, no timers, no fixtures — publish is called by the runtime when new frames appear.
 * Same `presentSession`/`dashboardView` path as Replay (Replay == Live). Failure-isolated via sink.
 */
export class RealtimePublisher {
  private lastIndex = -1;
  constructor(
    private readonly sink: PushSink,
    private readonly report: InvariantReport,
  ) {}

  /** Full Snapshot (initial connect / recovery / replay start). */
  publishSnapshot(frames: readonly FrameInput[]): DashboardSessionView {
    const view = presentSession(frames, this.report);
    this.sink.pushSnapshot(view);
    this.lastIndex = frames.length - 1;
    return view;
  }

  /** Incremental: emit an append-frame patch for each frame newer than the last publish. */
  publishNew(frames: readonly FrameInput[]): number {
    let pushed = 0;
    for (let i = this.lastIndex + 1; i < frames.length; i++) {
      const frame = frames[i]!;
      const patch: PresentationPatch = {
        op: 'append-frame',
        frame: dashboardView(frame, this.report),
        history: decisionHistory([frame])[0]!,
      };
      this.sink.pushUpdate(patch);
      pushed++;
    }
    this.lastIndex = frames.length - 1;
    return pushed;
  }
}
