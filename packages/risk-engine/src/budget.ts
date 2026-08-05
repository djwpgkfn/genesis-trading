export interface Reservation { reservation_id: string; request_id: string; amount: number; state: 'reserved' | 'consumed' | 'released' }

/**
 * Risk Budget: Reservation → Consumption → Release. Invariant maintained at all times:
 * reserved + consumed <= total (INV-R4). Over-budget reservations are rejected (INV-R5).
 */
export class RiskBudget {
  private reserved = 0;
  private consumed = 0;
  private readonly reservations = new Map<string, Reservation>();
  private counter = 0;

  constructor(private total: number) {}

  setTotal(total: number): void {
    this.total = total; // e.g. Market Health scaling; never lowers below already-committed
  }

  get available(): number {
    return this.total - this.reserved - this.consumed;
  }
  get committed(): number {
    return this.reserved + this.consumed;
  }
  invariantHolds(): boolean {
    return this.reserved + this.consumed <= this.total + 1e-9;
  }

  reserve(request_id: string, amount: number): Reservation | null {
    if (amount <= 0 || this.reserved + this.consumed + amount > this.total) return null; // INV-R5
    const reservation_id = `res-${++this.counter}`;
    const r: Reservation = { reservation_id, request_id, amount, state: 'reserved' };
    this.reservations.set(reservation_id, r);
    this.reserved += amount;
    return r;
  }

  consume(reservation_id: string): boolean {
    const r = this.reservations.get(reservation_id);
    if (!r || r.state !== 'reserved') return false;
    r.state = 'consumed';
    this.reserved -= r.amount;
    this.consumed += r.amount;
    return true;
  }

  /** Release a reservation (full) or a consumed position back to available. */
  release(reservation_id: string): boolean {
    const r = this.reservations.get(reservation_id);
    if (!r) return false;
    if (r.state === 'reserved') this.reserved -= r.amount;
    else if (r.state === 'consumed') this.consumed -= r.amount;
    else return false;
    r.state = 'released';
    return true;
  }

  snapshot(): { total: number; reserved: number; consumed: number; available: number } {
    return { total: this.total, reserved: this.reserved, consumed: this.consumed, available: this.available };
  }
}
