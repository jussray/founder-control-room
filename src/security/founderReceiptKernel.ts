import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const FOUNDER_RECEIPT_VERSION = 'fcr-founder-receipt-v1' as const;
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
  keyId: string;
  expiresAt: string;
  receiptId?: string;
  issuedAt?: string;
}

export interface FounderReceiptVerificationContext {
  decisionId: string;
  founderIdentity: string;
  action: string;
  resource: string;
  targetSha: string;
  scopeHash: string;
  now?: string;
}

export interface FounderReceiptConsumptionLedger {
  /** Atomically claim a receipt id. Returns false if it was already consumed. */
  claim(receiptId: string): boolean | Promise<boolean>;
}

export type FounderReceiptFailureCode =
  | 'RECEIPT_INVALID'
  | 'RECEIPT_SIGNATURE_INVALID'
  | 'RECEIPT_EXPIRED'
  | 'RECEIPT_SCOPE_MISMATCH'
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

function normalizedEvidenceRefs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !text(item))) return null;
  const refs = value.map((item) => text(item)).sort();
  return new Set(refs).size === refs.length ? refs : null;
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

function signClaims(receipt: FounderReceiptClaims, signingKey: string | Buffer): string {
  return createHmac('sha256', signingKeyBuffer(signingKey)).update(receiptPayload(receipt)).digest('hex');
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
    || Number.isNaN(Date.parse(receipt.issuedAt))
    || Number.isNaN(Date.parse(receipt.expiresAt))
    || !SHA256.test(receipt.signature)
  ) {
    return { ok: false, code: 'RECEIPT_INVALID', error: 'Founder receipt shape is invalid.' };
  }

  if (Date.parse(receipt.expiresAt) <= Date.parse(receipt.issuedAt)) {
    return { ok: false, code: 'RECEIPT_INVALID', error: 'Founder receipt must expire after issuance.' };
  }

  return { ok: true, receipt };
}

export function issueFounderReceipt(
  input: FounderReceiptIssueInput,
  signingKey: string | Buffer,
): FounderReceipt {
  const evidenceRefs = normalizedEvidenceRefs(input.evidenceRefs);
  const issuedAt = input.issuedAt ?? new Date().toISOString();
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
    keyId: text(input.keyId),
    issuedAt,
    expiresAt: text(input.expiresAt),
  };

  const validation = parseReceipt({ ...claims, signature: '0'.repeat(64) });
  if (!validation.ok) throw new Error(validation.error);

  return { ...claims, signature: signClaims(claims, signingKey) };
}

export function verifyFounderReceipt(
  value: unknown,
  context: FounderReceiptVerificationContext,
  signingKey: string | Buffer,
): FounderReceiptVerificationResult {
  const parsed = parseReceipt(value);
  if (!parsed.ok) return parsed;
  const receipt = parsed.receipt;

  const expectedSignature = signClaims(receipt, signingKey);
  const actual = Buffer.from(receipt.signature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return { ok: false, code: 'RECEIPT_SIGNATURE_INVALID', error: 'Founder receipt signature is invalid.' };
  }

  const now = Date.parse(context.now ?? new Date().toISOString());
  if (Number.isNaN(now) || Date.parse(receipt.expiresAt) <= now) {
    return { ok: false, code: 'RECEIPT_EXPIRED', error: 'Founder receipt is expired.' };
  }

  const scopeMatches =
    receipt.decisionId === text(context.decisionId)
    && receipt.founderIdentity.toLowerCase() === text(context.founderIdentity).toLowerCase()
    && receipt.action === text(context.action)
    && receipt.resource === text(context.resource)
    && receipt.targetSha === text(context.targetSha).toLowerCase()
    && receipt.scopeHash === text(context.scopeHash).toLowerCase();
  if (!scopeMatches) {
    return { ok: false, code: 'RECEIPT_SCOPE_MISMATCH', error: 'Founder receipt does not match the requested action scope.' };
  }

  return { ok: true, receipt };
}

export async function consumeFounderReceipt(
  value: unknown,
  context: FounderReceiptVerificationContext,
  signingKey: string | Buffer,
  ledger: FounderReceiptConsumptionLedger,
): Promise<FounderReceiptVerificationResult> {
  const verified = verifyFounderReceipt(value, context, signingKey);
  if (!verified.ok) return verified;

  const claimed = await ledger.claim(verified.receipt.receiptId);
  if (!claimed) {
    return { ok: false, code: 'RECEIPT_REPLAYED', error: 'Founder receipt has already been consumed.' };
  }

  return verified;
}
