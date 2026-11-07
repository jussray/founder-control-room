import { createHash } from 'node:crypto';
import type { CapabilityRequestV1 } from './capabilityExecutionContracts.js';
import type { FounderOsLabAction } from './contracts.js';

export const FOUNDER_DECISION_RECEIPT_CONTRACT = 'fcr/founder-decision-receipt@v0' as const;

export type FounderDecisionActorType = 'founder' | 'automation';
export type FounderDecision = 'approve' | 'authorize' | 'reject';

export interface FounderDecisionReceiptV0 {
  contract: typeof FOUNDER_DECISION_RECEIPT_CONTRACT;
  receiptId: string;
  actor: {
    type: FounderDecisionActorType;
    id: string;
  };
  decision: FounderDecision;
  action: FounderOsLabAction;
  capabilityPlanHash: string;
  expectedHeadSha: string;
  requestDigest?: string;
  evidenceUrls: string[];
  createdAt: string;
  expiresAt?: string;
}

export interface AuthenticatedFounderContextV0 {
  founderId: string;
  source: 'trusted-session' | 'registered-adapter';
  sourceRef: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const RECEIPT_ID = /^fcr-founder-decision-v0:[0-9a-f]{64}$/i;
const MAX_AUTHORIZATION_LEASE_MS = 60 * 60 * 1000;
const ALLOWED_ACTIONS = new Set<string>([
  'inspect',
  'plan',
  'draft-social',
  'queue-social',
  'publish-social',
  'merge-code',
  'deploy-code',
  'send-email',
]);
const STATE_CHANGING_ACTIONS = new Set<FounderOsLabAction>([
  'queue-social',
  'publish-social',
  'merge-code',
  'deploy-code',
  'send-email',
]);

function text(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value === null || typeof value !== 'object') return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortJsonValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function canonicalReceiptWithoutId(receipt: FounderDecisionReceiptV0): string {
  const { receiptId: _receiptId, ...payload } = receipt;
  return JSON.stringify(sortJsonValue(payload));
}

function canonicalCapabilityRequestSurface(request: CapabilityRequestV1): string {
  const { policyDecisionId: _policyDecisionId, ...surface } = request;
  return JSON.stringify(sortJsonValue(surface));
}

function validEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function validateAuthenticatedFounderContext(context: AuthenticatedFounderContextV0): string[] {
  const reasons: string[] = [];
  if (!isRecord(context)) {
    reasons.push('authenticated founder context must be an object');
    return reasons;
  }
  if (!text(context.founderId, 160)) reasons.push('authenticated founder id is required');
  if (context.source !== 'trusted-session' && context.source !== 'registered-adapter') {
    reasons.push('founder authority must come from a trusted session or registered adapter');
  }
  if (!text(context.sourceRef, 240)) reasons.push('trusted founder source reference is required');
  return reasons;
}

export function computeCapabilityRequestAuthorityDigest(request: CapabilityRequestV1): string {
  return createHash('sha256').update(canonicalCapabilityRequestSurface(request), 'utf8').digest('hex');
}

export function computeFounderDecisionReceiptId(receipt: FounderDecisionReceiptV0): string {
  const digest = createHash('sha256').update(canonicalReceiptWithoutId(receipt), 'utf8').digest('hex');
  return `fcr-founder-decision-v0:${digest}`;
}

export function validateFounderDecisionReceipt(receipt: FounderDecisionReceiptV0, now: number): string[] {
  const reasons: string[] = [];
  if (!isRecord(receipt)) return ['founder decision receipt must be an object'];

  if (receipt.contract !== FOUNDER_DECISION_RECEIPT_CONTRACT) reasons.push('unsupported founder decision receipt contract');
  if (!RECEIPT_ID.test(text(receipt.receiptId, 120))) reasons.push('receiptId must be a founder decision receipt id');

  const actor = isRecord(receipt.actor) ? receipt.actor : null;
  if (!actor) {
    reasons.push('actor must be an object');
  } else {
    if (!text(actor.id, 160)) reasons.push('actor id is required');
    if (actor.type !== 'founder' && actor.type !== 'automation') reasons.push('actor type must be founder or automation');
    if (receipt.decision === 'authorize' && actor.type !== 'founder') reasons.push('only a founder actor can issue an execution authorization');
  }

  if (receipt.decision !== 'approve' && receipt.decision !== 'authorize' && receipt.decision !== 'reject') reasons.push('unsupported decision');
  if (!ALLOWED_ACTIONS.has(text(receipt.action, 80))) reasons.push('unsupported founder action');
  if (!FULL_SHA.test(text(receipt.expectedHeadSha, 40))) reasons.push('expectedHeadSha must be a full Git SHA');
  if (!SHA256.test(text(receipt.capabilityPlanHash, 64))) reasons.push('capabilityPlanHash must be a sha256 hex digest');
  if (receipt.decision === 'authorize' && !SHA256.test(text(receipt.requestDigest, 64))) {
    reasons.push('execution authorization requires an exact capability request digest');
  }
  if (!Number.isFinite(now)) reasons.push('now must be a finite timestamp');

  const createdAtText = text(receipt.createdAt, 80);
  const createdAtMs = Date.parse(createdAtText);
  if (!createdAtText || Number.isNaN(createdAtMs)) reasons.push('createdAt must be an ISO-compatible timestamp');
  else if (Number.isFinite(now) && createdAtMs > now) reasons.push('founder decision receipt cannot be future-dated');

  if (receipt.decision === 'authorize' && receipt.expiresAt === undefined) reasons.push('execution authorization requires an explicit expiry');

  if (receipt.expiresAt !== undefined) {
    const expiresAtText = text(receipt.expiresAt, 80);
    const expiresAtMs = Date.parse(expiresAtText);
    if (!expiresAtText || Number.isNaN(expiresAtMs)) reasons.push('expiresAt must be an ISO-compatible timestamp');
    else if (!Number.isNaN(createdAtMs) && expiresAtMs <= createdAtMs) reasons.push('expiresAt must be after createdAt');
    else {
      if (receipt.decision === 'authorize' && !Number.isNaN(createdAtMs) && expiresAtMs - createdAtMs > MAX_AUTHORIZATION_LEASE_MS) reasons.push('execution authorization lifetime may not exceed 60 minutes');
      if (Number.isFinite(now) && expiresAtMs <= now) reasons.push('founder decision receipt is expired');
    }
  }

  const evidenceUrlsAreArray = Array.isArray(receipt.evidenceUrls);
  if (!evidenceUrlsAreArray) reasons.push('evidenceUrls must be an array');
  else if (receipt.evidenceUrls.some((value) => !validEvidenceUrl(text(value)))) reasons.push('evidence URLs must be valid HTTPS URLs or localhost/127.0.0.1 HTTP URLs');
  if (evidenceUrlsAreArray && STATE_CHANGING_ACTIONS.has(receipt.action) && receipt.decision !== 'reject' && receipt.evidenceUrls.length === 0) reasons.push('state-changing decisions require evidence URLs');
  if (RECEIPT_ID.test(text(receipt.receiptId, 120)) && receipt.receiptId !== computeFounderDecisionReceiptId(receipt)) reasons.push('receiptId does not match canonical founder decision content');
  return reasons;
}

export function createFounderDecisionReceipt(input: Omit<FounderDecisionReceiptV0, 'contract' | 'receiptId'>, now: number): FounderDecisionReceiptV0 {
  const candidate: FounderDecisionReceiptV0 = {
    contract: FOUNDER_DECISION_RECEIPT_CONTRACT,
    receiptId: `fcr-founder-decision-v0:${'0'.repeat(64)}`,
    ...input,
    capabilityPlanHash: input.capabilityPlanHash.toLowerCase(),
    expectedHeadSha: input.expectedHeadSha.toLowerCase(),
    ...(input.requestDigest === undefined ? {} : { requestDigest: input.requestDigest.toLowerCase() }),
    evidenceUrls: [...new Set(input.evidenceUrls.map((value) => value.trim()).filter(Boolean))].sort(),
  };
  candidate.receiptId = computeFounderDecisionReceiptId(candidate);
  const reasons = validateFounderDecisionReceipt(candidate, now);
  if (reasons.length > 0) throw new Error(reasons.join('; '));
  return candidate;
}

export function validateCapabilityRequestDecisionBinding(
  request: CapabilityRequestV1,
  decision: FounderDecisionReceiptV0,
  now: number | null,
  founderContext: AuthenticatedFounderContextV0,
): string[] {
  const evaluationTime = typeof now === 'number' ? now : Number.NaN;
  const reasons = [
    ...validateFounderDecisionReceipt(decision, evaluationTime),
    ...validateAuthenticatedFounderContext(founderContext),
  ];
  if (request.policyDecisionId !== decision.receiptId) reasons.push('capability request policyDecisionId does not match founder decision receipt');
  if (request.capabilityPlanHash !== decision.capabilityPlanHash) reasons.push('capability request plan hash does not match founder decision receipt');
  if (request.expectedHeadSha !== decision.expectedHeadSha) reasons.push('capability request head SHA does not match founder decision receipt');
  const requestDigest = computeCapabilityRequestAuthorityDigest(request);
  if (decision.requestDigest !== requestDigest) reasons.push('capability request digest does not match founder decision receipt');

  const actor = isRecord(decision.actor) ? decision.actor : null;
  if (!actor || actor.type !== 'founder') reasons.push('capability execution requires a founder-authored decision receipt');
  if (!actor || actor.id !== founderContext.founderId) reasons.push('founder decision receipt does not match authenticated founder identity');
  if (decision.decision !== 'authorize') reasons.push('capability execution requires an explicit founder authorization');
  return reasons;
}
