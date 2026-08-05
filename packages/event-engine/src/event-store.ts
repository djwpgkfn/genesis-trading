import { contentHash, chainHash } from './hash.js';
import { decisionClassValid, type EventInput, type StoredEvent } from './events.js';

/** Append-only. Interface intentionally has NO update/delete (INV-E1 structural). */
export interface EventStore {
  append(input: EventInput): StoredEvent;
  all(): readonly StoredEvent[];
  since(seq: number): readonly StoredEvent[];
  byCorrelation(correlationId: string): readonly StoredEvent[];
  verifyChain(): boolean;
  count(): number;
}

export class InMemoryEventStore implements EventStore {
  private readonly log: StoredEvent[] = [];

  append(input: EventInput): StoredEvent {
    if (!decisionClassValid(input)) {
      throw new Error(
        `Decision-class event missing snapshot_id/correlation_id (INV-E5): ${input.event_type}`,
      );
    }
    const seq = this.log.length + 1;
    const prev = this.log[this.log.length - 1];
    const prev_hash = prev?.hash;
    const content = contentHash({ ...input, seq, prev_hash: prev_hash ?? null });
    const hash = chainHash(prev_hash, content);
    const sealed: StoredEvent =
      prev_hash === undefined ? { ...input, seq, hash } : { ...input, seq, prev_hash, hash };
    this.log.push(sealed); // append-only; existing entries never mutated
    return sealed;
  }

  all(): readonly StoredEvent[] {
    return this.log;
  }
  since(seq: number): readonly StoredEvent[] {
    return this.log.filter((e) => e.seq > seq);
  }
  byCorrelation(correlationId: string): readonly StoredEvent[] {
    return this.log.filter((e) => e.correlation_id === correlationId);
  }
  count(): number {
    return this.log.length;
  }

  /** Recompute the chain and compare — detects any tampering (INV-E1). */
  verifyChain(): boolean {
    let prevHash: string | undefined;
    for (const e of this.log) {
      const { seq, prev_hash, hash, ...input } = e;
      const content = contentHash({ ...input, seq, prev_hash: prevHash ?? null });
      const expected = chainHash(prevHash, content);
      if (prev_hash !== prevHash || hash !== expected) return false;
      prevHash = hash;
    }
    return true;
  }
}
