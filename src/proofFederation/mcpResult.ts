import {
  FederatedProofContractError,
  type FederatedProofReceipt,
  validateFederatedProofReceipt,
} from './contract.js';

export interface FederatedMcpReceiptSummary {
  schema: 'juss-proof/v1';
  receiptId: string;
  project: string;
  actor: string;
  provider: string;
  scope: string;
  target: string;
  mode: string;
  exactSha?: string;
  operation: string;
  state: string;
  acknowledges: string[];
  dependsOn: string[];
  supersedes: string[];
  nextAuthority?: string;
  issuedAt: string;
  evidenceCount: number;
}

export interface FederatedReceiptInvocationPolicy {
  serverId: string;
  provider?: string;
  allowedScopes?: readonly string[];
  expectedRepository?: string;
  arguments: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function candidateFromMcpResult(result: unknown): unknown {
  if (!isRecord(result)) return undefined;
  const structured = result.structuredContent;
  if (!isRecord(structured) || structured.proofReceipt === undefined) return undefined;
  if (result.isError === true) {
    throw new FederatedProofContractError('error_result_cannot_emit_receipt');
  }
  return structured.proofReceipt;
}

function canonicalRepository(value: string): string {
  return value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '').toLowerCase();
}

function requestedRepository(args: Record<string, unknown>): string | undefined {
  if (typeof args.repository === 'string' && args.repository.trim()) {
    return canonicalRepository(args.repository);
  }
  if (
    typeof args.owner === 'string' &&
    args.owner.trim() &&
    typeof args.repo === 'string' &&
    args.repo.trim()
  ) {
    return canonicalRepository(`${args.owner}/${args.repo}`);
  }
  return undefined;
}

export function federatedProofReceiptFromMcpResult(
  result: unknown,
): FederatedProofReceipt | undefined {
  const candidate = candidateFromMcpResult(result);
  if (candidate === undefined) return undefined;
  return validateFederatedProofReceipt(candidate);
}

export function assertFederatedProofReceiptMatchesInvocation(
  receipt: FederatedProofReceipt,
  policy: FederatedReceiptInvocationPolicy,
): void {
  if (!policy.provider || !policy.allowedScopes?.length) {
    throw new FederatedProofContractError('untrusted_federated_receipt_source');
  }
  if (receipt.authority.provider !== policy.provider) {
    throw new FederatedProofContractError('receipt_provider_mismatch');
  }
  if (!policy.allowedScopes.includes(receipt.authority.scope)) {
    throw new FederatedProofContractError('receipt_scope_not_allowed');
  }

  if (receipt.authority.scope === 'repository') {
    const requested = requestedRepository(policy.arguments);
    if (!requested) {
      throw new FederatedProofContractError('repository_receipt_target_unbound');
    }
    if (!policy.expectedRepository?.trim()) {
      throw new FederatedProofContractError('project_repository_unbound');
    }
    const expected = canonicalRepository(policy.expectedRepository);
    if (requested !== expected) {
      throw new FederatedProofContractError('requested_repository_project_mismatch');
    }

    const declaredRepository = receipt.exactTarget.repository;
    if (!declaredRepository) {
      throw new FederatedProofContractError('repository_receipt_target_missing');
    }
    const targets = [receipt.project, receipt.authority.target, declaredRepository].map(canonicalRepository);
    if (targets.some((target) => target !== expected)) {
      throw new FederatedProofContractError('repository_receipt_target_mismatch');
    }
  }
}

export function summarizeFederatedProofReceipt(
  receipt: FederatedProofReceipt,
): FederatedMcpReceiptSummary {
  return {
    schema: receipt.schema,
    receiptId: receipt.receiptId,
    project: receipt.project,
    actor: receipt.actor,
    provider: receipt.authority.provider,
    scope: receipt.authority.scope,
    target: receipt.authority.target,
    mode: receipt.authority.mode,
    exactSha: receipt.exactTarget.sha,
    operation: receipt.operation,
    state: receipt.state,
    acknowledges: [...receipt.acknowledges],
    dependsOn: [...receipt.dependsOn],
    supersedes: [...receipt.supersedes],
    nextAuthority: receipt.nextAuthority,
    issuedAt: receipt.issuedAt,
    evidenceCount: receipt.evidence.length,
  };
}
