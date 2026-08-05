// Nominal/branded primitives — enforce that IDs/hashes/versions aren't mixed up.
// (Constitution P1/P8: everything traceable & versioned.)
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UUID = Brand<string, 'UUID'>;
export type Hash = Brand<string, 'Hash'>; // content hash (tamper-evident chain)
export type ISOTimestamp = Brand<string, 'ISOTimestamp'>; // UTC ISO-8601
export type Version = Brand<string, 'Version'>;
export type SnapshotId = Brand<string, 'SnapshotId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;

export const asUUID = (s: string): UUID => s as UUID;
export const asHash = (s: string): Hash => s as Hash;
export const asISOTimestamp = (s: string): ISOTimestamp => s as ISOTimestamp;
export const asVersion = (s: string): Version => s as Version;
export const asSnapshotId = (s: string): SnapshotId => s as SnapshotId;
export const asCorrelationId = (s: string): CorrelationId => s as CorrelationId;

export const CONTRACTS_SCHEMA_VERSION = 1 as const;

/**
 * Wall-clock provider — the single boundary where real time enters the system.
 * Everything else injects a clock; engines must not read the clock directly.
 */
// eslint-disable-next-line no-restricted-properties -- canonical clock boundary
export const systemNowMs = (): number => Date.now();
