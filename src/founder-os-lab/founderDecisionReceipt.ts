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
  evidenceUrls: string[];
  createdAt: string;
  expiresAt?: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const RECEIPT_ID = /^fcr-founder-decision-v0:[0-9a-f]{64}$/i;
const MUTATION_ACTIONS = new Set<FounderOsLabAction>([
  'queue-social',
  'publish-social',
  'merge-code',
  'deploy-code',
  'send-email',
]);

function text(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
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

export function computeFounderDecisionReceiptId(receipt: FounderDecisionReceiptV0): string {
  const digest = createHash('sha256')
    .update(canonicalReceiptWithoutId(receipt), 'utf8')
    .digest('hex');
  return `fcr-founder-decision-v0:${digest}`;
}

export function validateFounderDecisionReceipt(receipt: FounderDecisionReceiptV0, now = Date.now()): string[] {
  const reasons: string[] = [];
  if (receipt.contract !== FOUNDER_DECISION_RECEIPT_CONTRACT) reasons.push('unsupported founder decision receipt contract');
  if (!RECEIPT_ID.test(text(receipt.receiptId, 120))) reasons.push('receiptId must be a founder decision receipt id');
  if (!text(receipt.actor.id, 160)) reasons.push('actor id is required');
  if (receipt.actor.type !== 'founder' && receipt.actor.type !== 'automation') reasons.push('actor type must be founder or automation');
  if (receipt.decision !== 'approve' && receipt.decision !== 'authorize' && receipt.decision !== 'reject') reasons.push('unsupported decision');
  if (!FULL_SHA.test(text(receipt.expectedHeadSha, 40))) reasons.push('expectedHeadSha must be a full Git SHA');
  if (!SHA256.test(text(receipt.capabilityPlanHash, 64))) reasons.push('capabilityPlanHash must be a sha256 hex digest');
  if (!text(receipt.createdAt, 80) || Number.isNaN(Date.parse(receipt.createdAt))) reasons.push('createdAt must be an ISO-compatible timestamp');
  if (receipt.expiresAt !== undefined) {
    if (!text(receipt.expiresAt, 80) || Number.isNaN(Date.parse(receipt.expiresAt))) {
      reasons.push('expiresAt must be an ISO-compatible timestamp');
    } else if (Date.parse(receipt.expiresAt) <= Date.parse(receipt.createdAt)) {
      reasons.push('expiresAt must be after createdAt');
    } else if (Date.parse(receipt.expiresAt) < now) {
      reasons.push('founder decision receipt is expired');
    }
  }
  if (!Array.isArray(receipt.evidenceUrls)) {
    reasons.push('evidenceUrls must be an array');
  } else if (receipt.evidenceUrls.some((value) => !validEvidenceUrl(text(value)))) {
    reasons.push('evidence URLs must be valid HTTPS URLs or localhost/127.0.0.1 HTTP URLs');
  }
  if (MUTATION_ACTIONS.has(receipt.action) && receipt.decision !== 'reject' && receipt.evidenceUrls.length === 0) {
    reasons.push('mutation decisions require evidence URLs');
  }
  if (RECEIPT_ID.test(receipt.receiptId) && receipt.receiptId !== computeFounderDecisionReceiptId(receipt)) {
    reasons.push('receiptId does not match canonical founder decision content');
  }
  return reasons;
}

export function createFounderDecisionReceipt(
  input: Omit<FounderDecisionReceiptV0, 'contract' | 'receiptId'>,
): FounderDecisionReceiptV0 {
  const candidate: FounderDecisionReceiptV0 = {
    contract: FOUNDER_DECISION_RECEIPT_CONTRACT,
    receiptId: `fcr-founder-decision-v0:${'0'.repeat(64)}`,
    ...input,
    capabilityPlanHash: input.capabilityPlanHash.toLowerCase(),
    expectedHeadSha: input.expectedHeadSha.toLowerCase(),
    evidenceUrls: [...new Set(input.evidenceUrls.map((value) => value.trim()).filter(Boolean))].sort(),
  };
  candidate.receiptId = computeFounderDecisionReceiptId(candidate);
  const reasons = validateFounderDecisionReceipt(candidate);
  if (reasons.length > 0) throw new Error(reasons.join('; '));
  return candidate;
}

export function validateCapabilityRequestDecisionBinding(
  request: CapabilityRequestV1,
  decision: FounderDecisionReceiptV0,
): string[] {
  const reasons = validateFounderDecisionReceipt(decision);
  if (request.policyDecisionId !== decision.receiptId) reasons.push('capability request policyDecisionId does not match founder decision receipt');
  if (request.capabilityPlanHash !== decision.capabilityPlanHash) reasons.push('capability request plan hash does not match founder decision receipt');
  if (request.expectedHeadSha !== decision.expectedHeadSha) reasons.push('capability request head SHA does not match founder decision receipt');
  if (decision.decision === 'reject') reasons.push('rejected founder decision cannot authorize capability execution');
  return reasons;
}
