import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const FOUNDER_RECEIPT_VERSION = 'fcr-founder-receipt-v1' as const;
export const MAX_FOUNDER_RECEIPT_TTL_MS = 15 * 60 * 1_000;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const MIN_SIGNING_KEY_BYTES = 32;

export interface FounderReceiptClaims {
  version: typeof FOUNDER_RECEIPT_VERSION;
  receiptId: string;
  decisionId: string;
  founderIdentity: string;
  action: string;
  resource: string;
  targetSha: string;
  scopeHash: string;
  evidenceRefs: string[];
  issuer: 'founder-control-room';
  keyId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface FounderReceipt extends FounderReceiptClaims {
  signature: string;
}

export interface FounderReceiptIssueInput {
  decisionId: string;
  founderIdentity: string;
  action: string;
  resource: string;
  targetSha: string;
  scopeHash: string;
  evidenceRefs: string[];
  expiresAt: string;
  receiptId?: string;
}

export interface FounderReceiptSigner {
  keyId: string;
  signingKey: string | Buffer;
}

export interface FounderReceiptVerificationContext {
  decisionId: string;
  founderIdentity: string;
  action: string;
  resource: string;
  targetSha: string;
  scopeHash: string;
  evidenceRefs: string[];
  now?: string;
}

export interface FounderReceiptAuthoritySnapshot {
  targetSha: string;
  scopeHash: string;
  evidenceRefs: string[];
}

export interface FounderReceiptAuthorityResolver {
  /** Read the current authoritative target/scope/evidence immediately before consumption. */
  resolve(receipt: FounderReceipt): FounderReceiptAuthoritySnapshot | Promise<FounderReceiptAuthoritySnapshot>;
}

export interface FounderReceiptConsumptionLedger {
  /** Atomically claim a receipt id. Returns false if it was already consumed. */
  claim(receiptId: string): boolean | Promise<boolean>;
}

export type FounderReceiptFailureCode =
  | 'RECEIPT_INVALID'
  | 'RECEIPT_KEY_MISMATCH'
  | 'RECEIPT_SIGNATURE_INVALID'
  | 'RECEIPT_NOT_YET_VALID'
  | 'RECEIPT_EXPIRED'
  | 'RECEIPT_SCOPE_MISMATCH'
  | 'RECEIPT_AUTHORITY_UNAVAILABLE'
  | 'RECEIPT_AUTHORITY_EXPIRED'
  | 'RECEIPT_REPLAYED';

export type FounderReceiptVerificationResult =
  | { ok: true; receipt: FounderReceipt }
  | { ok: false; code: FounderReceiptFailureCode; error: string };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function signingKeyBuffer(signingKey: string | Buffer): Buffer {
  const key = Buffer.isBuffer(signingKey) ? signingKey : Buffer.from(signingKey, 'utf8');
  if (key.byteLength < MIN_SIGNING_KEY_BYTES) {
    throw new Error(`Founder receipt signing key must be at least ${MIN_SIGNING_KEY_BYTES} bytes.`);
  }
  return key;
}

function signerKeyId(signer: FounderReceiptSigner): string {
  const keyId = text(signer.keyId);
  if (!keyId) throw new Error('Founder receipt signer key id is required.');
  return keyId;
}

function normalizedEvidenceRefs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !text(item))) return null;
  const refs = value.map((item) => text(item)).sort();
  return new Set(refs).size === refs.length ? refs : null;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizedAuthoritySnapshot(value: unknown): FounderReceiptAuthoritySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const targetSha = text(candidate['targetSha']).toLowerCase();
  const scopeHash = text(candidate['scopeHash']).toLowerCase();
  const evidenceRefs = normalizedEvidenceRefs(candidate['evidenceRefs']);
  const knownKeys = new Set(['targetSha', 'scopeHash', 'evidenceRefs']);
  if (
    Object.keys(candidate).some((key) => !knownKeys.has(key))
    || !FULL_SHA.test(targetSha)
    || !SHA256.test(scopeHash)
    || !evidenceRefs
  ) {
    return null;
  }
  return { targetSha, scopeHash, evidenceRefs };
}

function receiptPayload(receipt: FounderReceiptClaims): string {
  return JSON.stringify({
    version: receipt.version,
    receiptId: receipt.receiptId,
    decisionId: receipt.decisionId,
    founderIdentity: receipt.founderIdentity,
    action: receipt.action,
    resource: receipt.resource,
    targetSha: receipt.targetSha.toLowerCase(),
    scopeHash: receipt.scopeHash.toLowerCase(),
    evidenceRefs: [...receipt.evidenceRefs].sort(),
    issuer: receipt.issuer,
    keyId: receipt.keyId,
    issuedAt: receipt.issuedAt,
    expiresAt: receipt.expiresAt,
  });
}

function signClaims(receipt: FounderReceiptClaims, signer: FounderReceiptSigner): string {
  return createHmac('sha256', signingKeyBuffer(signer.signingKey))
    .update(receiptPayload(receipt))
    .digest('hex');
}

function parseReceipt(value: unknown): FounderReceiptVerificationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'RECEIPT_INVALID', error: 'Founder receipt must be an object.' };
  }

  const candidate = value as Record<string, unknown>;
  const evidenceRefs = normalizedEvidenceRefs(candidate['evidenceRefs']);
  const receipt: FounderReceipt = {
    version: candidate['version'] as typeof FOUNDER_RECEIPT_VERSION,
    receiptId: text(candidate['receiptId']),
    decisionId: text(candidate['decisionId']),
    founderIdentity: text(candidate['founderIdentity']),
    action: text(candidate['action']),
    resource: text(candidate['resource']),
    targetSha: text(candidate['targetSha']).toLowerCase(),
    scopeHash: text(candidate['scopeHash']).toLowerCase(),
    evidenceRefs: evidenceRefs ?? [],
    issuer: candidate['issuer'] as 'founder-control-room',
    keyId: text(candidate['keyId']),
    issuedAt: text(candidate['issuedAt']),
    expiresAt: text(candidate['expiresAt']),
    signature: text(candidate['signature']).toLowerCase(),
  };

  const knownKeys = new Set([
    'version', 'receiptId', 'decisionId', 'founderIdentity', 'action', 'resource', 'targetSha',
    'scopeHash', 'evidenceRefs', 'issuer', 'keyId', 'issuedAt', 'expiresAt', 'signature',
  ]);
  if (Object.keys(candidate).some((key) => !knownKeys.has(key))) {
    return { ok: false, code: 'RECEIPT_INVALID', error: 'Founder receipt contains unknown fields.' };
  }

  const issuedAtMs = Date.parse(receipt.issuedAt);
  const expiresAtMs = Date.parse(receipt.expiresAt);
  if (
    receipt.version !== FOUNDER_RECEIPT_VERSION
    || !receipt.receiptId
    || !receipt.decisionId
    || !receipt.founderIdentity
    || !receipt.action
    || !receipt.resource
    || !FULL_SHA.test(receipt.targetSha)
    || !SHA256.test(receipt.scopeHash)
    || !evidenceRefs
    || receipt.issuer !== 'founder-control-room'
    || !receipt.keyId
    || Number.isNaN(issuedAtMs)
    || Number.isNaN(expiresAtMs)
    || !SHA256.test(receipt.signature)
  ) {
    return { ok: false, code: 'RECEIPT_INVALID', error: 'Founder receipt shape is invalid.' };
  }

  const ttlMs = expiresAtMs - issuedAtMs;
  if (ttlMs <= 0 || ttlMs > MAX_FOUNDER_RECEIPT_TTL_MS) {
    return {
      ok: false,
      code: 'RECEIPT_INVALID',
      error: `Founder receipt lifetime must be greater than zero and no longer than ${MAX_FOUNDER_RECEIPT_TTL_MS}ms.`,
    };
  }

  return { ok: true, receipt };
}

export function issueFounderReceipt(
  input: FounderReceiptIssueInput,
  signer: FounderReceiptSigner,
): FounderReceipt {
  const evidenceRefs = normalizedEvidenceRefs(input.evidenceRefs);
  const claims: FounderReceiptClaims = {
    version: FOUNDER_RECEIPT_VERSION,
    receiptId: text(input.receiptId) || randomUUID(),
    decisionId: text(input.decisionId),
    founderIdentity: text(input.founderIdentity),
    action: text(input.action),
    resource: text(input.resource),
    targetSha: text(input.targetSha).toLowerCase(),
    scopeHash: text(input.scopeHash).toLowerCase(),
    evidenceRefs: evidenceRefs ?? [],
    issuer: 'founder-control-room',
    keyId: signerKeyId(signer),
    issuedAt: new Date().toISOString(),
    expiresAt: text(input.expiresAt),
  };

  const validation = parseReceipt({ ...claims, signature: '0'.repeat(64) });
  if (!validation.ok) throw new Error(validation.error);

  return { ...claims, signature: signClaims(claims, signer) };
}

export function verifyFounderReceipt(
  value: unknown,
  context: FounderReceiptVerificationContext,
  signer: FounderReceiptSigner,
): FounderReceiptVerificationResult {
  const parsed = parseReceipt(value);
  if (!parsed.ok) return parsed;
  const receipt = parsed.receipt;

  const expectedEvidenceRefs = normalizedEvidenceRefs(context.evidenceRefs);
  if (!expectedEvidenceRefs) {
    return { ok: false, code: 'RECEIPT_INVALID', error: 'Founder receipt verification evidence references are invalid.' };
  }

  const expectedKeyId = signerKeyId(signer);
  if (receipt.keyId !== expectedKeyId) {
    return { ok: false, code: 'RECEIPT_KEY_MISMATCH', error: 'Founder receipt key identity does not match the trusted signer.' };
  }

  const expectedSignature = signClaims(receipt, signer);
  const actual = Buffer.from(receipt.signature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return { ok: false, code: 'RECEIPT_SIGNATURE_INVALID', error: 'Founder receipt signature is invalid.' };
  }

  const now = Date.parse(context.now ?? new Date().toISOString());
  if (Number.isNaN(now)) {
    return { ok: false, code: 'RECEIPT_INVALID', error: 'Founder receipt verification time is invalid.' };
  }
  if (Date.parse(receipt.issuedAt) > now) {
    return { ok: false, code: 'RECEIPT_NOT_YET_VALID', error: 'Founder receipt has not reached its issuance time.' };
  }
  if (Date.parse(receipt.expiresAt) <= now) {
    return { ok: false, code: 'RECEIPT_EXPIRED', error: 'Founder receipt is expired.' };
  }

  const scopeMatches =
    receipt.decisionId === text(context.decisionId)
    && receipt.founderIdentity.toLowerCase() === text(context.founderIdentity).toLowerCase()
    && receipt.action === text(context.action)
    && receipt.resource === text(context.resource)
    && receipt.targetSha === text(context.targetSha).toLowerCase()
    && receipt.scopeHash === text(context.scopeHash).toLowerCase()
    && sameStringArray(receipt.evidenceRefs, expectedEvidenceRefs);
  if (!scopeMatches) {
    return { ok: false, code: 'RECEIPT_SCOPE_MISMATCH', error: 'Founder receipt does not match the requested action, target, scope, or evidence.' };
  }

  return { ok: true, receipt };
}

export async function consumeFounderReceipt(
  value: unknown,
  context: FounderReceiptVerificationContext,
  signer: FounderReceiptSigner,
  ledger: FounderReceiptConsumptionLedger,
  authorityResolver: FounderReceiptAuthorityResolver,
): Promise<FounderReceiptVerificationResult> {
  const verified = verifyFounderReceipt(value, context, signer);
  if (!verified.ok) return verified;

  let currentAuthority: FounderReceiptAuthoritySnapshot | null = null;
  try {
    currentAuthority = normalizedAuthoritySnapshot(await authorityResolver.resolve(verified.receipt));
  } catch {
    return {
      ok: false,
      code: 'RECEIPT_AUTHORITY_UNAVAILABLE',
      error: 'Current founder receipt authority state could not be resolved.',
    };
  }
  if (!currentAuthority) {
    return {
      ok: false,
      code: 'RECEIPT_AUTHORITY_UNAVAILABLE',
      error: 'Current founder receipt authority state is invalid.',
    };
  }

  const authorityStillMatches =
    currentAuthority.targetSha === verified.receipt.targetSha
    && currentAuthority.scopeHash === verified.receipt.scopeHash
    && sameStringArray(currentAuthority.evidenceRefs, verified.receipt.evidenceRefs);
  if (!authorityStillMatches) {
    return {
      ok: false,
      code: 'RECEIPT_AUTHORITY_EXPIRED',
      error: 'Founder receipt remains historically valid, but its bound authority no longer matches current state.',
    };
  }

  const claimed = await ledger.claim(verified.receipt.receiptId);
  if (!claimed) {
    return { ok: false, code: 'RECEIPT_REPLAYED', error: 'Founder receipt has already been consumed.' };
  }

  return verified;
}
