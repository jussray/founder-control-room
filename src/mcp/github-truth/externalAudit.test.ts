import { describe, expect, it } from 'vitest';
import {
  GitHubAuditProviderError,
  type GitHubPrTruthEvidence,
  type GitHubPrTruthReaderLike,
} from '../../providers/GitHubPrTruthReader.js';
import { auditGitHubPullRequest } from './audit.js';

const BASE = 'b'.repeat(40);
const HEAD = 'a'.repeat(40);
const MOVED = 'c'.repeat(40);
const NOW = new Date('2026-09-14T02:40:00.000Z');
const OBSERVED = '2026-09-14T02:39:59.000Z';

function context(headSha = HEAD, baseShaSnapshot = BASE) {
  return {
    number: 702,
    repository: 'jussray/founder-control-room',
    headRepository: 'jussray/founder-control-room',
    baseRef: 'main',
    headRef: 'feat/github-truth-mcp-v0-core',
    baseShaSnapshot,
    headSha,
    authorIdentity: 'jussray',
    title: 'GitHub Truth',
    state: 'open' as const,
    draft: false,
    observedAt: OBSERVED,
  };
}

function evidence(overrides: Partial<GitHubPrTruthEvidence> = {}): GitHubPrTruthEvidence {
  const initialContext = context();
  const finalContext = context();
  return {
    initialContext,
    finalContext,
    initialPr: { number: 702, state: 'open', headSha: HEAD, observedAt: OBSERVED },
    finalPr: { number: 702, state: 'open', headSha: HEAD, observedAt: OBSERVED },
    liveBaseShaInitial: BASE,
    liveBaseShaFinal: BASE,
    requiredChecks: {
      state: 'complete',
      source: 'ruleset',
      requiredChecks: [
        { kind: 'check_run', context: 'Required Gate', appId: 15368 },
        { kind: 'check_run', context: 'Verify test-ledger contract', appId: 15368 },
      ],
      observedAt: OBSERVED,
      findings: [],
    },
    checks: [
      {
        kind: 'check_run',
        context: 'Required Gate',
        appId: 15368,
        headSha: HEAD,
        observedAt: OBSERVED,
        status: 'completed',
        conclusion: 'success',
        providerRunId: '1',
      },
      {
        kind: 'check_run',
        context: 'Verify test-ledger contract',
        appId: 15368,
        headSha: HEAD,
        observedAt: OBSERVED,
        status: 'completed',
        conclusion: 'success',
        providerRunId: '2',
      },
    ],
    reviews: [{
      id: 'review-1',
      reviewerId: 'reviewer',
      state: 'approved',
      commitSha: HEAD,
      provider: 'github',
      submittedAt: OBSERVED,
    }],
    diff: {
      baseSha: BASE,
      headSha: HEAD,
      aheadBy: 1,
      behindBy: 0,
      files: [{ path: 'src/example.ts', status: 'modified', additions: 2, deletions: 1 }],
    },
    kernelFindings: [],
    transportFindings: [],
    diagnostics: [],
    ...overrides,
  };
}

function reader(value: GitHubPrTruthEvidence): GitHubPrTruthReaderLike {
  return { readAuditEvidence: async () => value };
}

describe('external GitHub PR audit', () => {
  it('can become evidence_complete only with fresh live-base-bound provider-owned required checks', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence()),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.contract).toBe('founder-control-room/github-pr-audit@v3');
    expect(result.verdict).toBe('evidence_complete');
    expect(result.summary).toMatchObject({
      baseSha: BASE,
      headSha: HEAD,
      ciConclusion: 'pass',
      behindBy: 0,
    });
    expect(result.verification).toMatchObject({
      expectedHeadMatches: true,
      liveBaseStableAcrossRead: true,
      requiredCheckCoverage: 'complete',
      collectionCompleteness: 'complete',
    });
    expect(result.boundary).toEqual({
      evidenceAuditOnly: true,
      mergeApproved: false,
      mutationPerformed: false,
      proofCookieGrantsAuthority: false,
      providerTokenAuthority: 'read_only',
    });
    expect(result.proof?.continuityCookie).toMatchObject({
      authority: 'observation_only',
      browserCookie: false,
      reusableForAuthority: false,
    });
    expect(result.proof?.continuityCookie.expiresAt).toBe('2026-09-14T02:45:00.000Z');
  });

  it('fails incomplete when the candidate is behind current live main even if CI is green', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence({
        transportFindings: ['candidate_behind_live_base'],
        diff: { ...evidence().diff, behindBy: 1 },
      })),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.findings).toContain('candidate_behind_live_base');
    expect(result.summary.ciConclusion).toBe('unknown');
  });

  it('fails conflicted when caller-bound expected head disagrees with provider head', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence()),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: MOVED },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.findings).toContain('expected_head_sha_mismatch');
  });

  it('fails conflicted when live base moves while evidence is collected', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence({
        liveBaseShaFinal: MOVED,
        kernelFindings: ['pr_identity_changed_during_collection'],
        transportFindings: ['live_base_changed_during_collection'],
      })),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.findings).toContain('live_base_changed_during_collection');
  });

  it('turns provider denial into a receipt-able fail-closed result rather than throwing', async () => {
    const denied: GitHubPrTruthReaderLike = {
      readAuditEvidence: async () => {
        throw new GitHubAuditProviderError('provider_access_denied', 'secret provider detail');
      },
    };
    const result = await auditGitHubPullRequest(
      denied,
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.findings).toEqual(['provider_access_denied']);
    expect(result.proof).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret provider detail');
  });

  it('keeps stale review approval diagnostic-only and never turns it into current merge authority', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence({
        reviews: [{
          ...evidence().reviews[0]!,
          commitSha: MOVED,
        }],
      })),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.summary.reviewDecision).toBe('unknown');
    expect(result.diagnostics).toContain('review_approval_stale_for_head_sha');
    expect(result.boundary.mergeApproved).toBe(false);
  });

  it('forces review decision unknown when review collection is truncated', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence({
        transportFindings: ['review_collection_truncated'],
      })),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.findings).toContain('review_collection_truncated');
    expect(result.summary.reviewDecision).toBe('unknown');
    expect(result.boundary.mergeApproved).toBe(false);
  });
});