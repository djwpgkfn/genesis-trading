import { describe, it, expect } from 'vitest';
import { generateFillMessages, duplicateOf } from './simulated-fill-generator.js';
import { MyOrderFillBuffer } from '@genesis/adapters-upbit';

const INPUT = {
  client_order_id: 'paper-decision-1000',
  exchange_order_id: 'sim-paper-decision-1000',
  requested_notional: 100_000,
  price: 100_000,
  feeRate: 0.0005,
  at_ms: 10,
};

describe('I4-7B-2: SimulatedFillGenerator (myOrder-shaped, real normalization path)', () => {
  it('full fill → one myOrder message for the whole notional', () => {
    const msgs = generateFillMessages(INPUT, { kind: 'full' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.executed_funds).toBe(100_000);
    expect(msgs[0]!.identifier).toBe('paper-decision-1000');
    expect(msgs[0]!.uuid).toBe('sim-paper-decision-1000');
    expect(msgs[0]!.trade_uuid).toBe('sim-paper-decision-1000-t1');
  });

  it('messages normalize through the real MyOrderFillBuffer into FillEvents', () => {
    const buf = new MyOrderFillBuffer();
    for (const m of generateFillMessages(INPUT, { kind: 'full' })) buf.ingest(m);
    const fills = buf.fills('paper-decision-1000');
    expect(fills).toHaveLength(1);
    expect(fills[0]!.filled_notional).toBe(100_000);
    expect(fills[0]!.filled_qty).toBeCloseTo(1, 10);
    expect(fills[0]!.fee).toBeCloseTo(50, 10);
  });

  it('partial fill → less than requested', () => {
    const buf = new MyOrderFillBuffer();
    for (const m of generateFillMessages(INPUT, { kind: 'partial', filled: 60_000 })) buf.ingest(m);
    expect(buf.filledNotional('paper-decision-1000')).toBe(60_000);
  });

  it('multi fill → parts accrue', () => {
    const buf = new MyOrderFillBuffer();
    for (const m of generateFillMessages(INPUT, { kind: 'multi', parts: [30_000, 20_000, 50_000] })) buf.ingest(m);
    expect(buf.fills('paper-decision-1000')).toHaveLength(3);
    expect(buf.filledNotional('paper-decision-1000')).toBe(100_000);
  });

  it('duplicate delivery is deduped by the real trade_uuid', () => {
    const buf = new MyOrderFillBuffer();
    const msgs = generateFillMessages(INPUT, { kind: 'full' });
    expect(buf.ingest(msgs[0]!)).not.toBeNull();
    expect(buf.ingest(duplicateOf(msgs[0]!))).toBeNull(); // deduped
    expect(buf.filledNotional('paper-decision-1000')).toBe(100_000);
  });

  it('no fills → empty (cancelled order)', () => {
    expect(generateFillMessages(INPUT, { kind: 'none' })).toHaveLength(0);
  });

  it('generation is deterministic', () => {
    const a = generateFillMessages(INPUT, { kind: 'multi', parts: [40_000, 60_000] });
    const b = generateFillMessages(INPUT, { kind: 'multi', parts: [40_000, 60_000] });
    expect(b).toEqual(a);
  });
});
