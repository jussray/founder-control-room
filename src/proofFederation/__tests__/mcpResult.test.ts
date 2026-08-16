import { describe, expect, it } from 'vitest';
import { FederatedProofContractError } from '../contract.js';
import {
  assertFederatedProofReceiptMatchesInvocation,
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

function admittedPolicy(argumentsValue: Record<string, unknown> = { owner: 'jussray', repo: 'chief-ai-machine' }) {
  return {
    serverId: 'proofmode',
    provider: 'github',
    allowedScopes: ['repository'],
    arguments: argumentsValue,
  };
}

describe('federated MCP result recognition', () => {
  it('accepts a valid ProofMode receipt, binds it to the request, and reduces it to safe hub metadata', () => {
    const receipt = federatedProofReceiptFromMcpResult(result());
    expect(receipt?.exactTarget.sha).toBe(SHA);
    expect(receipt?.state).toBe('inferred');
    expect(() => assertFederatedProofReceiptMatchesInvocation(receipt!, admittedPolicy())).not.toThrow();

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

  it('rejects receipts from MCPs that were not admitted as proof authorities', () => {
    const receipt = federatedProofReceiptFromMcpResult(result())!;
    expect(() =>
      assertFederatedProofReceiptMatchesInvocation(receipt, {
        serverId: 'github',
        arguments: { owner: 'jussray', repo: 'chief-ai-machine' },
      }),
    ).toThrowError(new FederatedProofContractError('untrusted_federated_receipt_source'));
  });

  it('rejects provider, scope, and repository target substitution', () => {
    const receipt = federatedProofReceiptFromMcpResult(result())!;

    expect(() =>
      assertFederatedProofReceiptMatchesInvocation(receipt, {
        ...admittedPolicy(),
        provider: 'cloudflare',
      }),
    ).toThrowError(new FederatedProofContractError('receipt_provider_mismatch'));

    expect(() =>
      assertFederatedProofReceiptMatchesInvocation(receipt, {
        ...admittedPolicy(),
        allowedScopes: ['deployment'],
      }),
    ).toThrowError(new FederatedProofContractError('receipt_scope_not_allowed'));

    expect(() =>
      assertFederatedProofReceiptMatchesInvocation(
        receipt,
        admittedPolicy({ repository: 'jussray/StoryEngine' }),
      ),
    ).toThrowError(new FederatedProofContractError('repository_receipt_target_mismatch'));
  });
});
