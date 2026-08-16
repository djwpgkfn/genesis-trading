import { describe, it, expect } from 'vitest';
import { RingBuffer } from './ring-buffer.js';

describe('I2-2: RingBuffer (bounded recording buffer)', () => {
  it('keeps items in FIFO order within capacity', () => {
    const r = new RingBuffer<number>(5);
    [1, 2, 3].forEach((n) => r.push(n));
    expect(r.toArray()).toEqual([1, 2, 3]);
    expect(r.size).toBe(3);
  });
  it('drops the oldest past capacity', () => {
    const r = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => r.push(n));
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.size).toBe(3);
  });
  it('rejects non-positive capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
  });
});
