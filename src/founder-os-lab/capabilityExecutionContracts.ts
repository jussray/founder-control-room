export const CAPABILITY_REQUEST_CONTRACT = 'fcr/capability-request@v1' as const;
export const CAPABILITY_RECEIPT_CONTRACT = 'fcr/capability-receipt@v1' as const;

export type CapabilityId =
  | 'repo.inspect'
  | 'repo.diff'
  | 'test.focused'
  | 'test.integration'
  | 'playwright.analyze'
  | 'dependency.inspect'
  | 'redteam.l99'
  | 'evidence.normalize';

export type ExecutionStatus = 'COMPLETED' | 'BLOCKED' | 'FAILED';
export type EvidenceVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

export interface CapabilityEvidenceV1 {
  evidenceId: string;
  kind: 'test' | 'log' | 'artifact' | 'playwright' | 'review';
  verdict: EvidenceVerdict;
  digest: string;
  mediaType: string;
  size: number;
  requestedHeadSha: string;
  observedHeadSha: string | null;
  artifactUri?: string;
  observedAt: string;
}

export interface CapabilityRequestV1 {
  contract: typeof CAPABILITY_REQUEST_CONTRACT;
  goalId: string;
  runId: string;
  attemptId: string;
  traceId: string;
  expectedHeadSha: string;
  capability: CapabilityId;
  capabilityVersion: string;
  capabilityPlanHash: string;
  registryHash: string;
  policyDecisionId: string;
  policyVersion: string;
  idempotencyKey: string;
  retryOwner: 'workflow';
  timeoutMs: number;
  args: Record<string, unknown>;
}

export interface CapabilityReceiptV1 {
  contract: typeof CAPABILITY_RECEIPT_CONTRACT;
  runId: string;
  attemptId: string;
  traceId: string;
  capability: CapabilityId;
  requestedHeadSha: string;
  observedHeadSha: string | null;
  execution: ExecutionStatus;
  evidence: CapabilityEvidenceV1[];
  observations: string[];
  inferences: string[];
  startedAt: string;
  completedAt: string;
  receiptDigest: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export function validateCapabilityRequest(request: CapabilityRequestV1): string[] {
  const reasons: string[] = [];
  if (request.contract !== CAPABILITY_REQUEST_CONTRACT) reasons.push('unsupported capability request contract');
  if (!request.goalId.trim()) reasons.push('goalId is required');
  if (!request.runId.trim()) reasons.push('runId is required');
  if (!request.attemptId.trim()) reasons.push('attemptId is required');
  if (!request.traceId.trim()) reasons.push('traceId is required');
  if (!FULL_SHA.test(request.expectedHeadSha)) reasons.push('expectedHeadSha must be a full Git SHA');
  if (!request.capabilityVersion.trim()) reasons.push('capabilityVersion is required');
  if (!SHA256.test(request.capabilityPlanHash)) reasons.push('capabilityPlanHash must be a sha256 hex digest');
  if (!SHA256.test(request.registryHash)) reasons.push('registryHash must be a sha256 hex digest');
  if (!request.policyDecisionId.trim()) reasons.push('policyDecisionId is required');
  if (!request.policyVersion.trim()) reasons.push('policyVersion is required');
  if (!request.idempotencyKey.trim()) reasons.push('idempotencyKey is required');
  if (request.retryOwner !== 'workflow') reasons.push('retryOwner must be workflow');
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs <= 0 || request.timeoutMs > 900_000) {
    reasons.push('timeoutMs must be an integer between 1 and 900000');
  }
  return reasons;
}

export function validateCapabilityReceipt(
  request: CapabilityRequestV1,
  receipt: CapabilityReceiptV1,
): string[] {
  const reasons: string[] = [];
  if (receipt.contract !== CAPABILITY_RECEIPT_CONTRACT) reasons.push('unsupported capability receipt contract');
  if (receipt.runId !== request.runId) reasons.push('receipt runId does not match request');
  if (receipt.attemptId !== request.attemptId) reasons.push('receipt attemptId does not match request');
  if (receipt.traceId !== request.traceId) reasons.push('receipt traceId does not match request');
  if (receipt.capability !== request.capability) reasons.push('receipt capability does not match request');
  if (receipt.requestedHeadSha !== request.expectedHeadSha) reasons.push('receipt requestedHeadSha does not match request');
  if (receipt.observedHeadSha !== null && !FULL_SHA.test(receipt.observedHeadSha)) reasons.push('observedHeadSha must be a full Git SHA or null');
  if (receipt.execution === 'COMPLETED' && receipt.observedHeadSha !== request.expectedHeadSha) {
    reasons.push('completed receipt must bind to the exact requested head SHA');
  }
  if (!SHA256.test(receipt.receiptDigest)) reasons.push('receiptDigest must be a sha256 hex digest');
  for (const item of receipt.evidence) {
    if (!item.evidenceId.trim()) reasons.push('evidenceId is required');
    if (!SHA256.test(item.digest)) reasons.push('evidence digest must be a sha256 hex digest');
    if (!FULL_SHA.test(item.requestedHeadSha)) reasons.push('evidence requestedHeadSha must be a full Git SHA');
    if (item.requestedHeadSha !== request.expectedHeadSha) reasons.push('evidence requestedHeadSha does not match request');
    if (item.observedHeadSha !== null && !FULL_SHA.test(item.observedHeadSha)) reasons.push('evidence observedHeadSha must be a full Git SHA or null');
    if (!Number.isInteger(item.size) || item.size < 0) reasons.push('evidence size must be a non-negative integer');
  }
  return reasons;
}
