import { describe, expect, it } from 'vitest';
import { FederatedProofContractError } from '../contract.js';
import {
  federatedProofReceiptFromMcpResult,
  summarizeFederatedProofReceipt,
} from '../mcpResult.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const RECEIPT = '11111111-1111-4111-8111-111111111111';
const UPSTREAM = '22222222-2222-4222-8222-222222222222';

function result(overrides: Record<string, unknown> = {}) {
  return {
    isError: false,
    structuredContent: {
      repository: 'jussray/chief-ai-machine',
      proofReceipt: {
        schema: 'juss-proof/v1',
        receiptId: RECEIPT,
        project: 'jussray/chief-ai-machine',
        actor: 'proofmode-github-mcp',
        authority: {
          provider: 'github',
          scope: 'repository',
          target: 'jussray/chief-ai-machine',
          mode: 'verify',
        },
        exactTarget: {
          repository: 'jussray/chief-ai-machine',
          branch: 'main',
          sha: SHA,
        },
        operation: 'repository_evidence_audit',
        state: 'inferred',
        evidence: [
          { type: 'repository_snapshot', name: 'GitHub evidence collected', state: 'verified' },
        ],
        acknowledges: [UPSTREAM],
        dependsOn: [UPSTREAM],
        supersedes: [],
        nextAuthority: 'runtime-provider-mcp',
        issuedAt: '2026-08-16T09:00:00.000Z',
      },
      ...overrides,
    },
  };
}

describe('federated MCP result recognition', () => {
  it('accepts a valid ProofMode receipt and reduces it to safe hub metadata', () => {
    const receipt = federatedProofReceiptFromMcpResult(result());
    expect(receipt?.exactTarget.sha).toBe(SHA);
    expect(receipt?.state).toBe('inferred');

    expect(summarizeFederatedProofReceipt(receipt!)).toEqual({
      schema: 'juss-proof/v1',
      receiptId: RECEIPT,
      project: 'jussray/chief-ai-machine',
      actor: 'proofmode-github-mcp',
      provider: 'github',
      scope: 'repository',
      target: 'jussray/chief-ai-machine',
      mode: 'verify',
      exactSha: SHA,
      operation: 'repository_evidence_audit',
      state: 'inferred',
      acknowledges: [UPSTREAM],
      dependsOn: [UPSTREAM],
      supersedes: [],
      nextAuthority: 'runtime-provider-mcp',
      issuedAt: '2026-08-16T09:00:00.000Z',
      evidenceCount: 1,
    });
  });

  it('returns no receipt for ordinary MCP results', () => {
    expect(federatedProofReceiptFromMcpResult({ structuredContent: { ok: true } })).toBeUndefined();
  });

  it('fails closed on malformed or error-path receipts', () => {
    const malformed = result();
    (malformed.structuredContent.proofReceipt as { exactTarget: { sha: string } }).exactTarget.sha = 'main';
    expect(() => federatedProofReceiptFromMcpResult(malformed)).toThrowError(
      new FederatedProofContractError('invalid_target_sha'),
    );

    const failed = result();
    failed.isError = true;
    expect(() => federatedProofReceiptFromMcpResult(failed)).toThrowError(
      new FederatedProofContractError('error_result_cannot_emit_receipt'),
    );
  });
});
