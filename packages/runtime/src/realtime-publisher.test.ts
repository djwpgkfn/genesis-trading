import { describe, it, expect } from 'vitest';
import { buildSampleRecording } from '@genesis/replay-engine';
import { presentSession, applyPatches, type PresentationPatch } from '@genesis/presentation';
import { RealtimePublisher, type PushSink } from './realtime-publisher.js';

const report = { passed: 49, total: 49, failing: [] as string[] };

class MockSink implements PushSink {
  snapshots: unknown[] = [];
  updates: unknown[] = [];
  pushSnapshot(p: unknown): boolean {
    this.snapshots.push(p);
    return true;
  }
  pushUpdate(p: unknown): boolean {
    this.updates.push(p);
    return true;
  }
}

describe('I2-3: RealtimePublisher', () => {
  it('publishSnapshot pushes a full snapshot (no polling, push-driven)', () => {
    const sink = new MockSink();
    const pub = new RealtimePublisher(sink, report);
    const frames = buildSampleRecording(3);
    pub.publishSnapshot(frames);
    expect(sink.snapshots.length).toBe(1);
    expect(sink.updates.length).toBe(0);
  });

  it('publishNew emits an append-frame patch only for new frames', () => {
    const sink = new MockSink();
    const pub = new RealtimePublisher(sink, report);
    const frames = buildSampleRecording(4);
    pub.publishSnapshot(frames.slice(0, 2)); // baseline: 2 frames
    const pushed = pub.publishNew(frames); // 2 new
    expect(pushed).toBe(2);
    expect(sink.updates.length).toBe(2);
    expect((sink.updates[0] as PresentationPatch).op).toBe('append-frame');
  });

  it('snapshot + emitted patches == full snapshot (Replay == Live pipeline)', () => {
    const sink = new MockSink();
    const pub = new RealtimePublisher(sink, report);
    const frames = buildSampleRecording(5);
    const base = pub.publishSnapshot(frames.slice(0, 1));
    pub.publishNew(frames);
    const folded = applyPatches(base, sink.updates as PresentationPatch[]);
    expect(folded).toEqual(presentSession(frames, report));
  });
});
