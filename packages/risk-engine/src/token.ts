export interface ApprovalToken {
  token_id: string;
  request_id: string;
  reservation_id: string;
  used: boolean;
  valid: boolean;
}

/** Single-use approval tokens. Invalidated en masse on HALT (INV-R2). */
export class TokenRegistry {
  private readonly tokens = new Map<string, ApprovalToken>();
  private counter = 0;

  issue(request_id: string, reservation_id: string): ApprovalToken {
    const t: ApprovalToken = {
      token_id: `tok-${++this.counter}`,
      request_id,
      reservation_id,
      used: false,
      valid: true,
    };
    this.tokens.set(t.token_id, t);
    return t;
  }

  isUsable(token_id: string): boolean {
    const t = this.tokens.get(token_id);
    return !!t && t.valid && !t.used;
  }

  /** Consume the token (single-use). Returns false if invalid/already used. */
  use(token_id: string): boolean {
    const t = this.tokens.get(token_id);
    if (!t || !t.valid || t.used) return false;
    t.used = true;
    return true;
  }

  /** INV-R2: invalidate ALL tokens immediately (called on HALT). */
  invalidateAll(): void {
    for (const t of this.tokens.values()) t.valid = false;
  }

  get(token_id: string): ApprovalToken | undefined {
    return this.tokens.get(token_id);
  }
}
