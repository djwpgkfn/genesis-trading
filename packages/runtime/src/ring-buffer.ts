/** Bounded FIFO ring buffer. Deterministic; drops the oldest item past capacity. */
export class RingBuffer<T> {
  private readonly buf: T[] = [];
  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error('RingBuffer capacity must be > 0');
  }
  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.capacity) this.buf.shift();
  }
  toArray(): T[] {
    return [...this.buf];
  }
  get size(): number {
    return this.buf.length;
  }
}
