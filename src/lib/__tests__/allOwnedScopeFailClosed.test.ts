import { describe, expect, it } from 'vitest';
import {
  evaluateFounderSignalAutomation,
  type FounderSignalAutomationGrant,
  type FounderSignalCandidate,
} from '../founderSignalAutomationPolicy.js';
import {
  classifyRepositoryForContent,
  type RepositoryEvidence,
} from '../socialCampaignPolicy.js';

const SHA = 'a'.repeat(40);

function automationCandidate(repository: string): FounderSignalCandidate {
  const proofUrl = `https://github.com/${repository}/commit/${SHA}`;
  return {
    repository,
    channel: 'linkedin',
    audienceSegment: 'build-in-public',
    proofUrl,
    sourceCommitSha: SHA,
    evidenceReceipt: {
      verified: true,
      provider: 'github',
      repository,
      sourceCommitSha: SHA,
      proofUrl,
    },
    who: 'Builders and aligned investors',
    what: 'A verified milestone shipped',
    where: 'LinkedIn',
    when: 'After exact-head verification',
    why: 'It demonstrates product progress',
    how: 'Review the bound proof URL',
  };
}

function sensitiveRepository(
  configuredMode?: RepositoryEvidence['policy']['configuredMode'],
): RepositoryEvidence {
  return {
    fullName: 'jussray/Sekret-Bip',
    visibility: 'public',
    archived: false,
    exactHead: SHA,
    recentCommitCount: 4,
    recentMergedPullRequests: 1,
    policy: {
      containsMinorOrSensitiveData: true,
      configuredMode,
      publicProofUrls: ['https://sekretbip.net'],
      neverClaim: [],
      neverExpose: ['teen records'],
    },
  };
}

describe('all-owned repository scope fail-closed edges', () => {
  const grant: FounderSignalAutomationGrant = {
    id: 'all-owned-test',
    enabled: true,
    routes: [{ channel: 'linkedin', audienceSegment: 'build-in-public' }],
    repositories: [],
    repositoryScope: { mode: 'all_owned', owner: 'jussray' },
    approvedRecipientIds: [],
    expiresAt: null,
  };

  it('requires exactly owner/repository and rejects extra path segments', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      automationCandidate('jussray/repository/extra'),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toContain('repository is outside the grant scope');
  });

  it('rejects an empty repository segment', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      automationCandidate('jussray/'),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toContain('repository is outside the grant scope');
  });
});

describe('sensitive repository explicit policy precedence', () => {
  it('keeps an explicit output-safeguard block closed even with a reviewed sanitized surface', () => {
    const result = classifyRepositoryForContent(
      sensitiveRepository('blocked_pending_output_safeguard'),
    );

    expect(result.mode).toBe('blocked_pending_output_safeguard');
    expect(result.eligibleForDraftGeneration).toBe(false);
    expect(result.daysAllocated).toBe(0);
  });

  it('keeps explicit not_eligible closed even with a reviewed sanitized surface', () => {
    const result = classifyRepositoryForContent(
      sensitiveRepository('not_eligible'),
    );

    expect(result.mode).toBe('not_eligible');
    expect(result.eligibleForDraftGeneration).toBe(false);
    expect(result.daysAllocated).toBe(0);
  });

  it('keeps archived sensitive repositories ineligible', () => {
    const result = classifyRepositoryForContent({
      ...sensitiveRepository('full_campaign'),
      archived: true,
    });

    expect(result.mode).toBe('not_eligible');
    expect(result.eligibleForDraftGeneration).toBe(false);
    expect(result.daysAllocated).toBe(0);
  });
});
