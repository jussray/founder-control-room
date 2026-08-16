import { describe, expect, it } from 'vitest';
import type { RepositoryProvider } from '../../providers/RepositoryProvider.js';
import {
  assertFederatedReceiptAcknowledgement,
  FEDERATED_PROOF_CONTRACT,
  FederatedProofContractError,
  validateFederatedProofReceipt,
  type FederatedProofReceipt,
} from '../contract.js';
import { collectFcrGitHubProof } from '../githubEvidence.js';
import { buildFederatedProofView } from '../registry.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const RECEIPT_A = '11111111-1111-4111-8111-111111111111';
const RECEIPT_B = '22222222-2222-4222-8222-222222222222';
const RECEIPT_C = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-08-16T08:45:00.000Z';

function receipt(overrides: Partial<FederatedProofReceipt> = {}): FederatedProofReceipt {
  return {
    schema: FEDERATED_PROOF_CONTRACT,
    receiptId: RECEIPT_A,
    project: 'jussray/chief-ai-machine',
    actor: 'github-mcp',
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
    state: 'verified',
    evidence: [{ type: 'check_run', name: 'Unit Tests', state: 'verified' }],
    acknowledges: [],
    dependsOn: [],
    supersedes: [],
    nextAuthority: 'cloudflare-mcp',
    issuedAt: NOW,
    ...overrides,
  };
}

describe('federated proof contract', () => {
  it('normalizes exact SHA and receipt identity without accepting private fields', () => {
    const validated = validateFederatedProofReceipt({
      ...receipt(),
      receiptId: RECEIPT_A.toUpperCase(),
      exactTarget: { ...receipt().exactTarget, sha: SHA.toUpperCase() },
    });

    expect(validated.receiptId).toBe(RECEIPT_A);
    expect(validated.exactTarget.sha).toBe(SHA);

    expect(() => validateFederatedProofReceipt({ ...receipt(), token: 'secret' })).toThrowError(
      new FederatedProofContractError('unknown_or_private_field'),
    );
  });

  it('requires acknowledged receipts to describe the same project and exact SHA', () => {
    const upstream = receipt();
    const downstream = receipt({
      receiptId: RECEIPT_B,
      actor: 'cloudflare-mcp',
      authority: { provider: 'cloudflare', scope: 'deployment', target: 'chief-ai', mode: 'verify' },
      operation: 'deployment_verification',
      acknowledges: [RECEIPT_A],
      dependsOn: [RECEIPT_A],
    });

    expect(() => assertFederatedReceiptAcknowledgement(downstream, upstream)).not.toThrow();
    expect(() =>
      assertFederatedReceiptAcknowledgement(
        { ...downstream, exactTarget: { ...downstream.exactTarget, sha: OTHER_SHA } },
        upstream,
      ),
    ).toThrowError(new FederatedProofContractError('acknowledgement_sha_mismatch'));
  });

  it('projects acknowledgements and supersession without erasing history', () => {
    const first = receipt();
    const second = receipt({
      receiptId: RECEIPT_B,
      actor: 'cloudflare-mcp',
      authority: { provider: 'cloudflare', scope: 'deployment', target: 'chief-ai', mode: 'verify' },
      operation: 'deployment_verification',
      acknowledges: [RECEIPT_A],
      dependsOn: [RECEIPT_A],
      issuedAt: '2026-08-16T08:46:00.000Z',
    });
    const replacement = receipt({
      receiptId: RECEIPT_C,
      supersedes: [RECEIPT_A],
      issuedAt: '2026-08-16T08:47:00.000Z',
    });

    const view = buildFederatedProofView([first, second, replacement]);
    expect(view.receipts).toHaveLength(3);
    expect(view.activeReceipts.map((item) => item.receiptId)).not.toContain(RECEIPT_A);
    expect(view.supersededReceiptIds).toEqual([RECEIPT_A]);
    expect(view.acknowledgedBy[RECEIPT_A]).toEqual([RECEIPT_B]);
    expect(view.danglingReferences).toEqual([]);
  });

  it('fails closed when registry lineage crosses project, SHA, or authority boundaries', () => {
    const upstream = receipt();
    const wrongShaAcknowledgement = receipt({
      receiptId: RECEIPT_B,
      actor: 'cloudflare-mcp',
      authority: { provider: 'cloudflare', scope: 'deployment', target: 'chief-ai', mode: 'verify' },
      exactTarget: { repository: 'jussray/chief-ai-machine', sha: OTHER_SHA, environment: 'production' },
      operation: 'deployment_verification',
      acknowledges: [RECEIPT_A],
      issuedAt: '2026-08-16T08:46:00.000Z',
    });
    expect(() => buildFederatedProofView([upstream, wrongShaAcknowledgement])).toThrowError(
      new FederatedProofContractError('acknowledgement_sha_mismatch'),
    );

    const wrongProjectDependency = receipt({
      receiptId: RECEIPT_B,
      project: 'jussray/StoryEngine',
      authority: { provider: 'github', scope: 'repository', target: 'jussray/StoryEngine', mode: 'verify' },
      exactTarget: { repository: 'jussray/StoryEngine', sha: SHA },
      dependsOn: [RECEIPT_A],
      issuedAt: '2026-08-16T08:46:00.000Z',
    });
    expect(() => buildFederatedProofView([upstream, wrongProjectDependency])).toThrowError(
      new FederatedProofContractError('dependency_project_mismatch'),
    );

    const wrongAuthoritySupersession = receipt({
      receiptId: RECEIPT_C,
      actor: 'cloudflare-mcp',
      authority: { provider: 'cloudflare', scope: 'deployment', target: 'chief-ai', mode: 'verify' },
      operation: 'deployment_verification',
      supersedes: [RECEIPT_A],
      issuedAt: '2026-08-16T08:47:00.000Z',
    });
    expect(() => buildFederatedProofView([upstream, wrongAuthoritySupersession])).toThrowError(
      new FederatedProofContractError('supersession_authority_mismatch'),
    );
  });

  it('lets FCR independently emit the same contract while owning receipt identity and time', async () => {
    const provider = {
      getRef: async () => ({ name: 'main', commitSha: SHA }),
      listVerificationSignals: async () => [
        {
          id: '1',
          name: 'Unit Tests',
          status: 'passed',
          commitSha: SHA,
          provider: 'github',
          detailsUrl: 'https://github.com/jussray/chief-ai-machine/actions/runs/1',
        },
      ],
    } as unknown as RepositoryProvider;

    const output = await collectFcrGitHubProof(
      {
        repository: 'jussray/chief-ai-machine',
        ref: 'main',
      },
      {
        providerForProject(config) {
          expect(config.repo_identifier).toBe('jussray/chief-ai-machine');
          return provider;
        },
        createReceiptId: () => RECEIPT_A,
        now: () => new Date(NOW),
      },
    );

    expect(output.schema).toBe('juss-proof/v1');
    expect(output.receiptId).toBe(RECEIPT_A);
    expect(output.issuedAt).toBe(NOW);
    expect(output.actor).toBe('fcr-github-provider');
    expect(output.exactTarget.sha).toBe(SHA);
    expect(output.state).toBe('verified');
    expect(output.evidence[0]).toMatchObject({ type: 'check_run', name: 'Unit Tests', state: 'verified' });
  });
});
