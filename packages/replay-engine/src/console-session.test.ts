import { describe, it, expect } from 'vitest';
import { OperatorReplaySession, buildSampleRecording } from './index.js';

describe('OperatorReplaySession (transport + cursor)', () => {
  const rec = () => buildSampleRecording(3);

  it('follows the replay state machine (IDLE→LOADED→PLAYING→PAUSED→…)', () => {
    const s = new OperatorReplaySession(rec());
    expect(s.getState()).toBe('IDLE');
    expect(() => s.play()).toThrow(); // cannot play before load
    s.load();
    expect(s.getState()).toBe('LOADED');
    s.play(2);
    expect(s.getState()).toBe('PLAYING');
    expect(s.getSpeed()).toBe(2);
    s.pause();
    expect(s.getState()).toBe('PAUSED');
    s.stop();
    expect(s.getState()).toBe('STOPPED');
    s.reset();
    expect(s.getState()).toBe('LOADED');
    expect(s.getCursor().frame_index).toBe(0);
  });

  it('advances frame-by-frame and completes at the end', () => {
    const s = new OperatorReplaySession(rec()).load().play();
    expect(s.advance()).toBe(true); // 0→1
    expect(s.advance()).toBe(false); // 1→2 is last → COMPLETED
    expect(s.getState()).toBe('COMPLETED');
    expect(s.getCursor().frame_index).toBe(2);
  });

  it('navigates via seek/step and jumps to a decision (history click)', () => {
    const frames = rec();
    const s = new OperatorReplaySession(frames).load();
    s.seek(2);
    expect(s.getCursor().frame_index).toBe(2);
    s.step(-1);
    expect(s.getCursor().frame_index).toBe(1);
    s.seekToDecision(frames[2]!.decision.id);
    expect(s.getCursor().frame_index).toBe(2);
    expect(() => s.seek(99)).toThrow(); // out of range
    expect(() => s.seekToDecision('nope')).toThrow();
  });

  it('speed changes never alter frame content (INV-R11)', () => {
    const s = new OperatorReplaySession(rec()).load();
    s.seek(1);
    const before = s.currentFrame();
    s.setSpeed(10);
    expect(s.currentFrame()).toBe(before);
    expect(s.getCursor().frame_index).toBe(1);
  });

  it('restore returns stored snapshot and decision', () => {
    const frames = rec();
    const s = new OperatorReplaySession(frames).load();
    s.seek(1);
    expect(s.restoreDecision()).toBe(frames[1]!.decision);
    expect(s.restoreSnapshot()).toBe(frames[1]!.snapshot);
  });

  it('cannot navigate while PLAYING (must pause)', () => {
    const s = new OperatorReplaySession(rec()).load().play();
    expect(() => s.seek(1)).toThrow();
  });
});
