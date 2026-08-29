import { describe, expect, it } from 'vitest';
import type { GitHubPrTruthEvidence, GitHubPrTruthReaderLike } from '../../providers/GitHubPrTruthReader.js';
import { auditGitHubPullRequest } from './audit.js';

const BASE = 'b'.repeat(40);
const HEAD = 'a'.repeat(40);
const MOVED = 'c'.repeat(40);
const NOW = new Date('2026-08-29T07:30:00.000Z');

function evidence(overrides: Partial<GitHubPrTruthEvidence> = {}): GitHubPrTruthEvidence {
  const context = {
    number: 702,
    repository: 'jussray/founder-control-room',
    headRepository: 'jussray/founder-control-room',
    baseRef: 'main',
    headRef: 'feat/github-truth-mcp-v0-core',
    baseSha: BASE,
    headSha: HEAD,
    authorIdentity: 'jussray',
  };
  return {
    initialPullRequest: context,
    finalPullRequest: context,
    verificationSignals: [{
      id: 'check-1',
      name: 'Required Gate',
      status: 'passed',
      commitSha: HEAD,
      provider: 'github',
      evidenceFingerprint: 'd'.repeat(64),
      issuer: { kind: 'app', id: '12345' },
      completedAt: '2026-08-29T07:29:00.000Z',
    }],
    reviewSignals: [{
      id: 'review-1',
      reviewerId: 'reviewer-1',
      state: 'approved',
      commitSha: HEAD,
      provider: 'github',
      submittedAt: '2026-08-29T07:28:00.000Z',
    }],
    diff: {
      base: BASE,
      head: HEAD,
      aheadBy: 1,
      behindBy: 0,
      files: [{
        path: 'src/example.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        patch: 'PRIVATE PATCH MUST NOT ENTER THE PROOF',
      }],
    },
    ...overrides,
  };
}

function reader(value: GitHubPrTruthEvidence): GitHubPrTruthReaderLike {
  return { readAuditEvidence: async () => value };
}

describe('external GitHub PR audit proof binding', () => {
  it('binds exact candidate and evidence fingerprints to a short-lived non-authorizing continuity cookie', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence()),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.contract).toBe('founder-control-room/github-pr-audit@v2');
    expect(result.verdict).toBe('evidence_incomplete');
    expect(result.proof.diffFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.proof.candidateFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.proof.evidenceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.proof.continuityCookie).toMatchObject({
      contextType: 'external-read',
      owner: 'founder-control-room-external-mcp',
      parentCookieId: null,
      authority: 'observation_only',
      browserCookie: false,
      reusableForAuthority: false,
    });
    expect(result.proof.continuityCookie.cookieId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.proof.continuityCookie.expiresAt).toBe('2026-08-29T07:35:00.000Z');
    expect(result.boundary).toMatchObject({
      evidenceAuditOnly: true,
      mergeApproved: false,
      mutationPerformed: false,
      proofCookieGrantsAuthority: false,
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE PATCH MUST NOT ENTER THE PROOF');
  });

  it('marks the result conflicted when provider PR identity moves during collection', async () => {
    const value = evidence({
      finalPullRequest: {
        ...evidence().finalPullRequest,
        headSha: MOVED,
      },
    });
    const result = await auditGitHubPullRequest(
      reader(value),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.verdict).toBe('evidence_conflicted');
    expect(result.findings).toContain('pr_identity_changed_during_collection');
    expect(result.findings).toContain('expected_head_sha_mismatch');
  });

  it('changes only the evidence fingerprint when observation evidence changes for the same candidate', async () => {
    const first = await auditGitHubPullRequest(
      reader(evidence()),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );
    const second = await auditGitHubPullRequest(
      reader(evidence({
        verificationSignals: [{
          ...evidence().verificationSignals[0]!,
          status: 'failed',
        }],
      })),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(second.proof.candidateFingerprint).toBe(first.proof.candidateFingerprint);
    expect(second.proof.evidenceFingerprint).not.toBe(first.proof.evidenceFingerprint);
    expect(second.summary.ciConclusion).toBe('fail');
  });

  it('keeps stale approval from becoming current approval after a head change', async () => {
    const result = await auditGitHubPullRequest(
      reader(evidence({
        reviewSignals: [{
          ...evidence().reviewSignals[0]!,
          commitSha: MOVED,
        }],
      })),
      { repository: 'jussray/founder-control-room', pullNumber: 702, expectedHeadSha: HEAD },
      () => NOW,
    );

    expect(result.summary.reviewDecision).toBe('unknown');
    expect(result.findings).toContain('review_approval_stale_for_head_sha');
  });
});
