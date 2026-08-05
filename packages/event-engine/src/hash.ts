import { createHash } from 'node:crypto';

/** Canonical JSON: recursively sort object keys → stable, deterministic serialization. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function contentHash(v: unknown): string {
  return sha256(canonical(v));
}

/** Tamper-evident chain: hash = sha256(prev_hash + content_hash). */
export function chainHash(prev: string | undefined, content: string): string {
  return sha256((prev ?? '') + content);
}
