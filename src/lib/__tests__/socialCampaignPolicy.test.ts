import { describe, expect, it } from 'vitest';
import {
  buildFirstPartySocialPostInput,
  classifyRepositoryForContent,
  type RepositoryEvidence,
} from '../socialCampaignPolicy.js';

const VALID_HEAD = 'a'.repeat(40);

function repo(overrides: Partial<RepositoryEvidence> = {}): RepositoryEvidence {
  return {
    fullName: 'jussray/example',
    visibility: 'public',
    archived: false,
    exactHead: VALID_HEAD,
    recentCommitCount: 5,
    recentMergedPullRequests: 2,
    policy: {
      containsMinorOrSensitiveData: false,
      publicProofUrls: [],
      neverClaim: [],
      neverExpose: [],
    },
    ...overrides,
  };
}

describe('classifyRepositoryForContent', () => {
  it('blocks a sensitive-data repository even when configuredMode requests a full campaign', () => {
    const result = classifyRepositoryForContent(
      repo({
        fullName: 'jussray/Sekret-Bip',
        policy: {
          containsMinorOrSensitiveData: true,
          configuredMode: 'full_campaign',
          publicProofUrls: ['https://sekretbip.net'],
          neverClaim: [],
          neverExpose: ['teen records'],
        },
      }),
    );

    expect(result.mode).toBe('blocked_pending_output_safeguard');
    expect(result.eligibleForDraftGeneration).toBe(false);
    expect(result.daysAllocated).toBe(0);
  });

  it('blocks a sensitive-data repository with no activity at all, same as an active one', () => {
    const result = classifyRepositoryForContent(
      repo({
        recentCommitCount: 0,
        recentMergedPullRequests: 0,
        policy: {
          containsMinorOrSensitiveData: true,
          publicProofUrls: [],
          neverClaim: [],
          neverExpose: [],
        },
      }),
    );

    expect(result.mode).toBe('blocked_pending_output_safeguard');
    expect(result.eligibleForDraftGeneration).toBe(false);
  });

  it('refuses to classify an unverified (non-exact) head', () => {
    const result = classifyRepositoryForContent(repo({ exactHead: 'not-a-real-sha' }));
    expect(result.mode).toBe('not_eligible');
    expect(result.eligibleForDraftGeneration).toBe(false);
  });

  it('blocks archived repositories', () => {
    const result = classifyRepositoryForContent(repo({ archived: true }));
    expect(result.mode).toBe('not_eligible');
  });

  it('blocks private repositories with no approved public proof', () => {
    const result = classifyRepositoryForContent(
      repo({
        visibility: 'private',
        policy: {
          containsMinorOrSensitiveData: false,
          publicProofUrls: [],
          neverClaim: [],
          neverExpose: [],
        },
      }),
    );
    expect(result.mode).toBe('not_eligible');
    expect(result.eligibleForDraftGeneration).toBe(false);
  });

  it('caps inactive repositories at ecosystem_only regardless of other signals', () => {
    const result = classifyRepositoryForContent(repo({ recentCommitCount: 0, recentMergedPullRequests: 0 }));
    expect(result.mode).toBe('ecosystem_only');
    expect(result.daysAllocated).toBe(1);
  });

  it('grants a full campaign only with an explicit policy and real activity', () => {
    const result = classifyRepositoryForContent(
      repo({
        policy: {
          containsMinorOrSensitiveData: false,
          configuredMode: 'full_campaign',
          publicProofUrls: ['https://github.com/jussray/example'],
          neverClaim: [],
          neverExpose: [],
        },
      }),
    );
    expect(result.mode).toBe('full_campaign');
    expect(result.daysAllocated).toBe(14);
    expect(result.eligibleForDraftGeneration).toBe(true);
  });

  it('defaults active, unconfigured repositories to a short ecosystem window, not a full campaign', () => {
    const result = classifyRepositoryForContent(repo());
    expect(result.mode).toBe('ecosystem_only');
    expect(result.daysAllocated).toBe(2);
  });
});

describe('buildFirstPartySocialPostInput', () => {
  const draft = {
    platform: 'linkedin' as const,
    accountId: 'acct_123',
    text: 'Verified progress on the founder control room, with a governance-first approach and a real link below.',
    traction: 'Shipped Phase 4 health badges to the real dashboard.',
    governanceAdvantage: 'Evidence-first, approval-gated by design.',
    audienceValue: 'See how the system actually verifies its own claims.',
    investorSignal: 'Consistent, reviewable shipping cadence.',
    proofLinks: [{ label: 'PR', url: 'https://github.com/jussray/founder-control-room/pull/188' }],
  };

  it('refuses to build input for an ineligible repository', () => {
    const blocked = classifyRepositoryForContent(
      repo({
        fullName: 'jussray/Sekret-Bip',
        policy: {
          containsMinorOrSensitiveData: true,
          publicProofUrls: [],
          neverClaim: [],
          neverExpose: [],
        },
      }),
    );

    expect(() => buildFirstPartySocialPostInput(blocked, repo({ fullName: 'jussray/Sekret-Bip' }), draft)).toThrow(
      /not eligible/,
    );
  });

  it('always builds draft-mode input, never queue or publish', () => {
    const eligible = classifyRepositoryForContent(repo());
    const input = buildFirstPartySocialPostInput(eligible, repo(), draft);

    expect(input.mode).toBe('draft');
    expect(input.publishAllowed).toBe(false);
    expect(input.founderApprovalId).toBeNull();
    expect(input.contentField).toBe('linkedin_draft');
    expect(input.sourceRepository).toBe('jussray/example');
    expect(input.sourceCommitSha).toBe(VALID_HEAD);
  });

  it('uses the real per-platform contentField, not a guessed pattern (tiktok is _caption, not _draft)', () => {
    const eligible = classifyRepositoryForContent(repo());
    const input = buildFirstPartySocialPostInput(eligible, repo(), { ...draft, platform: 'tiktok' });
    expect(input.contentField).toBe('tiktok_caption');
  });
});
