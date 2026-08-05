import { createHash, createHmac, randomUUID } from 'node:crypto';

const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** SHA-512 of the (already URL-encoded) query string — Upbit's query_hash. */
export function queryHash(queryString: string): string {
  return createHash('sha512').update(queryString, 'utf8').digest('hex');
}

export interface UpbitKeys { accessKey: string; secretKey: string }

/**
 * Real Upbit private-API JWT (HS256). Payload = access_key + nonce (+ query_hash for
 * parameterized requests). Signed with the secret key. `Authorization: Bearer <jwt>`.
 */
export function signUpbitJwt(keys: UpbitKeys, queryString?: string): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload: Record<string, string> = { access_key: keys.accessKey, nonce: randomUUID() };
  if (queryString && queryString.length > 0) {
    payload['query_hash'] = queryHash(queryString);
    payload['query_hash_alg'] = 'SHA512';
  }
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const sig = b64url(createHmac('sha256', keys.secretKey).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

/** Verify (for tests): recompute signature. */
export function verifyUpbitJwt(token: string, secretKey: string): boolean {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  const expected = b64url(createHmac('sha256', secretKey).update(`${h}.${p}`).digest());
  return expected === s;
}

/** Encode params to a deterministic Upbit query string (sorted keys). */
export function toQueryString(params: Record<string, string | number>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]!))}`)
    .join('&');
}
