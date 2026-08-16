import { describe, it, expect } from 'vitest';
import { InMemoryRawStore, type RawRecord } from '@genesis/data-layer';
import { TradingCore } from '@genesis/decision-engine';
import { InMemoryEventStore } from '@genesis/event-engine';
import { presentSession } from '@genesis/presentation';
import { LiveRuntime } from './live-runtime.js';

function seed(store: InMemoryRawStore, n = 40): void {
  for (let i = 0; i < n; i++) {
    const ms = i * 60_000;
    store.append({
      kind: 'trade',
      symbol: 'KRW-BTC',
      event_time: new Date(ms).toISOString() as RawRecord['event_time'],
      ingest_time: new Date(ms).toISOString() as RawRecord['ingest_time'],
      event_time_ms: ms,
      ingest_time_ms: ms,
      seq: i,
      payload: { type: 'trade', code: 'KRW-BTC', trade_price: 100 + i * 1.5, trade_volume: 1 },
    });
  }
}

function makeRuntime(capacity?: number) {
  const store = new InMemoryRawStore();
  seed(store);
  const core = new TradingCore(new InMemoryEventStore());
  let clock = 40 * 60_000;
  const opts: ConstructorParameters<typeof LiveRuntime>[2] = {
    symbol: 'KRW-BTC',
    now: () => clock,
  };
  if (capacity !== undefined) opts.recordingCapacity = capacity;
  const rt = new LiveRuntime(store, core, opts);
  const advance = (ms: number) => {
    clock += ms;
  };
  return { rt, advance };
}

describe('I2-2: LiveRuntime Recording Sink', () => {
  it('records a RecordedFrame per decision-producing tick with the full schema', () => {
    const { rt, advance } = makeRuntime();
    rt.tick();
    advance(60_000);
    rt.tick();
    const frames = rt.frames();
    expect(frames.length).toBe(2);
    const f = frames[0]!;
    expect(f).toHaveProperty('index');
    expect(f).toHaveProperty('correlation_id');
    expect(f.snapshot.symbol).toBe('KRW-BTC');
    expect(f.risk).toBeDefined();
    expect(f.portfolio).toBeDefined();
    expect(f.decision).not.toBeNull();
    expect(frames[1]!.index).toBe(1);
  });

  it('is bounded by recordingCapacity (oldest dropped)', () => {
    const { rt, advance } = makeRuntime(2);
    for (let i = 0; i < 4; i++) {
      rt.tick();
      advance(60_000);
    }
    expect(rt.frames().length).toBe(2);
  });

  it('is deterministic — Replay == Live (same store + clock ⇒ identical frames)', () => {
    const a = makeRuntime();
    const b = makeRuntime();
    for (let i = 0; i < 3; i++) {
      a.rt.tick();
      a.advance(60_000);
      b.rt.tick();
      b.advance(60_000);
    }
    expect(a.rt.frames()).toEqual(b.rt.frames());
  });

  it('recorded frames feed presentSession identically to Replay (same pipeline)', () => {
    const { rt, advance } = makeRuntime();
    rt.tick();
    advance(60_000);
    rt.tick();
    const view = presentSession(rt.frames(), { passed: 48, total: 48, failing: [] });
    expect(view.frames.length).toBe(2);
    expect(view.history.length).toBe(2);
  });
});
