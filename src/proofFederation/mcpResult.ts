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

export function federatedProofReceiptFromMcpResult(
  result: unknown,
): FederatedProofReceipt | undefined {
  const candidate = candidateFromMcpResult(result);
  if (candidate === undefined) return undefined;
  return validateFederatedProofReceipt(candidate);
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
