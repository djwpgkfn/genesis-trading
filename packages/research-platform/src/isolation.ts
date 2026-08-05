/**
 * Structural isolation (INV-S3): Research can ONLY execute virtually. There is NO real-broker /
 * account port anywhere in this package, so real-account access is impossible by construction —
 * not by policy. The type system offers only VirtualExecution.
 */
export interface Order { symbol: string; qty: number; price: number }
export interface Fill { filled: number; price: number }

export interface VirtualExecution {
  readonly mode: 'virtual';
  simulateFill(order: Order): Fill;
}

export function makeVirtualExecution(): VirtualExecution {
  return { mode: 'virtual', simulateFill: (o) => ({ filled: o.qty, price: o.price }) };
}

/** Marker asserting this runtime has no real-account capability. */
export const RESEARCH_ISOLATED = true as const;
