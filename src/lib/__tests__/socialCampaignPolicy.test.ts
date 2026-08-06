import { describe, expect, it } from 'vitest';
import {
  buildFirstPartySocialPostInput,
  classifyRepositoryForContent,
  type RepositoryEvidence,
} from '../socialCampaignPolicy.js';
import type { FounderSignalAutomationGrant } from '../founderSignalAutomationPolicy.js';

const VALID_HEAD = 'a'.repeat(40);
const APPROVED_PROOF_ROOT = 'https://github.com/jussray/example';

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
      publicProofUrls: [APPROVED_PROOF_ROOT],
      neverClaim: [],
      neverExpose: [],
    },
    ...overrides,
  };
}

describe('classifyRepositoryForContent', () => {
  it('keeps sensitive-data repositories in the portfolio through sanitized progress mode', () => {
    const source = repo({
      fullName: 'jussray/Sekret-Bip',
      policy: {
        containsMinorOrSensitiveData: true,
        configuredMode: 'full_campaign',
        publicProofUrls: ['https://sekretbip.net'],
        neverClaim: [],
        neverExpose: ['teen records'],
      },
    });
    const result = classifyRepositoryForContent(source);

    expect(result.mode).toBe('sanitized_product_only');
    expect(result.eligibleForDraftGeneration).toBe(true);
    expect(result.daysAllocated).toBe(2);
    expect(result.authorizedRepository).toBe(source.fullName);
    expect(result.authorizedExactHead).toBe(source.exactHead);
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

  it('blocks a sensitive repository when the sanitized public surface is incomplete', () => {
    const result = classifyRepositoryForContent(
      repo({
        fullName: 'jussray/Sekret-Bip',
        policy: {
          containsMinorOrSensitiveData: true,
          publicProofUrls: ['https://sekretbip.net'],
          neverClaim: [],
          neverExpose: [],
        },
      }),
    );

    expect(result.mode).toBe('blocked_pending_output_safeguard');
    expect(result.eligibleForDraftGeneration).toBe(false);
  });

  it('honors an explicit blocked mode for a non-sensitive repository', () => {
    const result = classifyRepositoryForContent(
      repo({
        policy: {
          containsMinorOrSensitiveData: false,
          configuredMode: 'blocked_pending_output_safeguard',
          publicProofUrls: [APPROVED_PROOF_ROOT],
          neverClaim: [],
          neverExpose: [],
        },
      }),
    );

    expect(result.mode).toBe('blocked_pending_output_safeguard');
    expect(result.eligibleForDraftGeneration).toBe(false);
    expect(result.daysAllocated).toBe(0);
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
          publicProofUrls: [APPROVED_PROOF_ROOT],
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
    proofLinks: [{ label: 'PR', url: `${APPROVED_PROOF_ROOT}/pull/188` }],
  };

  it('refuses to build input when a sensitive repository has no reviewed public surface', () => {
    const source = repo({
      fullName: 'jussray/Sekret-Bip',
      policy: {
        containsMinorOrSensitiveData: true,
        publicProofUrls: [],
        neverClaim: [],
        neverExpose: [],
      },
    });
    const blocked = classifyRepositoryForContent(source);

    expect(() => buildFirstPartySocialPostInput(blocked, source, draft)).toThrow(/not eligible/);
  });

  it('rejects a classification reused for another repository', () => {
    const first = repo({ fullName: 'jussray/first' });
    const second = repo({ fullName: 'jussray/second' });
    const eligible = classifyRepositoryForContent(first);

    expect(() => buildFirstPartySocialPostInput(eligible, second, draft)).toThrow(/does not authorize/);
  });

  it('rejects a stale classification reused after the repository head changes', () => {
    const first = repo();
    const moved = repo({ exactHead: 'b'.repeat(40) });
    const eligible = classifyRepositoryForContent(first);

    expect(() => buildFirstPartySocialPostInput(eligible, moved, draft)).toThrow(/does not authorize/);
  });

  it('enforces repository-specific neverClaim and neverExpose terms', () => {
    const source = repo({
      policy: {
        containsMinorOrSensitiveData: false,
        publicProofUrls: [APPROVED_PROOF_ROOT],
        neverClaim: ['SOC 2 certified'],
        neverExpose: ['vendor margin'],
      },
    });
    const eligible = classifyRepositoryForContent(source);

    expect(() =>
      buildFirstPartySocialPostInput(eligible, source, {
        ...draft,
        text: `${draft.text} We are SOC 2 certified.`,
      }),
    ).toThrow(/neverClaim/);

    expect(() =>
      buildFirstPartySocialPostInput(eligible, source, {
        ...draft,
        traction: 'The vendor margin is now visible.',
      }),
    ).toThrow(/neverExpose/);
  });

  it('blocks punctuation, whitespace, and Unicode obfuscation of prohibited claims', () => {
    const source = repo({
      policy: {
        containsMinorOrSensitiveData: false,
        publicProofUrls: [APPROVED_PROOF_ROOT],
        neverClaim: ['SOC 2 certified'],
        neverExpose: [],
      },
    });
    const eligible = classifyRepositoryForContent(source);

    expect(() =>
      buildFirstPartySocialPostInput(eligible, source, {
        ...draft,
        text: `${draft.text} We are Ｓ.Ｏ.Ｃ.—２   certified.`,
      }),
    ).toThrow(/neverClaim/);
  });

  it('checks media alt text and percent-decoded URLs for prohibited exposure', () => {
    const source = repo({
      policy: {
        containsMinorOrSensitiveData: false,
        publicProofUrls: [APPROVED_PROOF_ROOT],
        neverClaim: [],
        neverExpose: ['vendor margin'],
      },
    });
    const eligible = classifyRepositoryForContent(source);

    expect(() =>
      buildFirstPartySocialPostInput(eligible, source, {
        ...draft,
        media: [{ type: 'image', url: 'https://example.com/proof.png', altText: 'Vendor—margin chart' }],
      }),
    ).toThrow(/neverExpose/);

    expect(() =>
      buildFirstPartySocialPostInput(eligible, source, {
        ...draft,
        proofLinks: [{ label: 'Proof', url: `${APPROVED_PROOF_ROOT}/vendor%20margin` }],
      }),
    ).toThrow(/neverExpose/);
  });

  it('rejects proof links outside the repository-approved public roots', () => {
    const source = repo();
    const eligible = classifyRepositoryForContent(source);

    expect(() =>
      buildFirstPartySocialPostInput(eligible, source, {
        ...draft,
        proofLinks: [{ label: 'Unapproved proof', url: 'https://example.com/unapproved' }],
      }),
    ).toThrow(/unapproved proof URL/);
  });

  it('rejects draft construction when no public proof URL is approved', () => {
    const source = repo({
      policy: {
        containsMinorOrSensitiveData: false,
        publicProofUrls: [],
        neverClaim: [],
        neverExpose: [],
      },
    });
    const eligible = classifyRepositoryForContent(source);

    expect(() => buildFirstPartySocialPostInput(eligible, source, draft)).toThrow(/no approved public proof URLs/);
  });

  it('always builds draft-mode input, never queue or publish', () => {
    const source = repo();
    const eligible = classifyRepositoryForContent(source);
    const input = buildFirstPartySocialPostInput(eligible, source, draft);

    expect(input.mode).toBe('draft');
    expect(input.publishAllowed).toBe(false);
    expect(input.founderApprovalId).toBeNull();
    expect(input.contentField).toBe('linkedin_draft');
    expect(input.sourceRepository).toBe('jussray/example');
    expect(input.sourceCommitSha).toBe(VALID_HEAD);
  });

  it('requires verified limits and media, then carries them into media-platform input', () => {
    const source = repo();
    const eligible = classifyRepositoryForContent(source);

    expect(() => buildFirstPartySocialPostInput(eligible, source, { ...draft, platform: 'tiktok' })).toThrow(
      /platformCharacterLimit/,
    );

    expect(() =>
      buildFirstPartySocialPostInput(eligible, source, {
        ...draft,
        platform: 'tiktok',
        platformCharacterLimit: 2200,
      }),
    ).toThrow(/media asset/);

    const input = buildFirstPartySocialPostInput(eligible, source, {
      ...draft,
      platform: 'tiktok',
      platformCharacterLimit: 2200,
      media: [{ type: 'video', url: 'https://example.com/proof-video.mp4', altText: 'Product proof clip' }],
    });

    expect(input.contentField).toBe('tiktok_caption');
    expect(input.platformCharacterLimit).toBe(2200);
    expect(input.media).toHaveLength(1);
  });
});
