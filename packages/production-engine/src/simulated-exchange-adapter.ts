import type { Order } from './execution-gateway.js';
import type { AsyncExchangeAdapter, SubmissionResult, OrderStatus } from './execution-contract.js';

/**
 * I4-7B-1 Simulated Exchange Adapter (Paper Trading boundary).
 *
 * A venue-agnostic `AsyncExchangeAdapter` implementation used for Paper Trading. It performs NO
 * network I/O, requires NO API credentials, and never touches any Upbit REST/WS code — this module
 * deliberately imports nothing from `@genesis/adapters-upbit`, so a real order cannot be submitted
 * through it by construction.
 *
 * Scope (7B-1): submission acknowledgement only. Fill generation, PaperPortfolio and the full paper
 * pipeline are NOT implemented here — those are 7B-2. The `mode` option exists so 7B-2 can drive
 * deterministic rejection/failure scenarios through the same adapter.
 *
 * Determinism: `exchange_order_id` is derived from `client_order_id` (no randomness), and the clock
 * is injected, so identical inputs produce identical results — required for replayable paper runs.
 */

/** How the simulated venue responds to a submission. Deterministic — no randomness. */
export type SimulationMode =
  | 'accept' // ACKNOWLEDGED (default)
  | 'reject' // REJECTED status (submission refused by the venue)
  | 'throw'; // transport-level failure: submitOrder throws (gateway must fail closed)

export interface SimulatedExchangeOptions {
  /** Venue response mode. Default 'accept'. */
  mode?: SimulationMode;
  /** Injected clock (ms). Default returns 0 so runs are reproducible without a real clock. */
  now?: () => number;
  /** Prefix for the generated exchange order id. Default 'sim'. */
  idPrefix?: string;
}

export class SimulatedExchangeAdapter implements AsyncExchangeAdapter {
  private readonly mode: SimulationMode;
  private readonly now: () => number;
  private readonly idPrefix: string;
  /** Number of submissions handled by this simulator (observability; never a real order). */
  private submissions = 0;

  constructor(opts: SimulatedExchangeOptions = {}) {
    this.mode = opts.mode ?? 'accept';
    this.now = opts.now ?? (() => 0);
    this.idPrefix = opts.idPrefix ?? 'sim';
  }

  /** Submissions simulated so far. */
  submissionCount(): number {
    return this.submissions;
  }

  /**
   * Orders actually sent to a real exchange by this adapter. Structurally always 0 — this class has
   * no network client and no credentials.
   */
  realOrderCount(): 0 {
    return 0;
  }

  /** Deterministic venue order id for a client order id. */
  exchangeOrderIdFor(client_order_id: string): string {
    return `${this.idPrefix}-${client_order_id}`;
  }

  /**
   * Simulate a submission. Returns an acknowledgement — NOT a fill (fills are reconciled separately,
   * exactly as with the real venue). Throws only in 'throw' mode, so the gateway's fail-closed path
   * can be exercised deterministically.
   */
  async submitOrder(order: Order): Promise<SubmissionResult> {
    this.submissions += 1;
    const submitted_at_ms = this.now();
    if (this.mode === 'throw') {
      throw new Error(`simulated exchange failure for ${order.client_order_id}`);
    }
    const status: OrderStatus = this.mode === 'reject' ? 'REJECTED' : 'ACKNOWLEDGED';
    return {
      client_order_id: order.client_order_id,
      exchange_order_id: status === 'REJECTED' ? null : this.exchangeOrderIdFor(order.client_order_id),
      status,
      submitted_at_ms,
      reason: status === 'REJECTED' ? 'rejected: simulated venue refusal' : 'accepted (simulated)',
    };
  }
}
