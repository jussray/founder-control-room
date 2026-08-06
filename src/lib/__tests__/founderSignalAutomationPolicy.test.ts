import { describe, expect, it } from 'vitest';
import {
  evaluateFounderSignalAutomation,
  type FounderSignalAutomationGrant,
  type FounderSignalCandidate,
} from '../founderSignalAutomationPolicy.js';

const SHA = 'f4573d360a8fea99b301f33a2a21192525725f7b';
const PROOF_URL = 'https://github.com/jussray/Sekret-Bip/pull/599';

const grant: FounderSignalAutomationGrant = {
  id: 'founder-approved-auto-distribution-v1',
  enabled: true,
  routes: [
    { channel: 'linkedin', audienceSegment: 'build-in-public' },
    { channel: 'facebook', audienceSegment: 'build-in-public' },
    { channel: 'instagram', audienceSegment: 'build-in-public' },
    { channel: 'gmail', audienceSegment: 'preapproved-potential-investors' },
  ],
  repositories: ['jussray/Sekret-Bip', 'jussray/founder-control-room'],
  approvedRecipientIds: ['hubspot-contact-123'],
  expiresAt: null,
};

function candidate(overrides: Partial<FounderSignalCandidate> = {}): FounderSignalCandidate {
  return {
    repository: 'jussray/Sekret-Bip',
    channel: 'linkedin',
    audienceSegment: 'build-in-public',
    proofUrl: PROOF_URL,
    sourceCommitSha: SHA,
    evidenceReceipt: {
      verified: true,
      provider: 'github',
      repository: 'jussray/Sekret-Bip',
      sourceCommitSha: SHA,
      proofUrl: PROOF_URL,
    },
    who: 'Builders, operators, and aligned investors',
    what: 'A verified product milestone shipped',
    where: 'LinkedIn',
    when: 'After the merge and deployment proof passed',
    why: 'It demonstrates execution and product progress',
    how: 'Follow the build or request the proof package',
    ...overrides,
  };
}

describe('evaluateFounderSignalAutomation', () => {
  it('covers every repository owned by jussray without a fixed social allowlist', () => {
    const allOwnedGrant: FounderSignalAutomationGrant = {
      ...grant,
      repositories: [],
      repositoryScope: { mode: 'all_owned', owner: 'jussray' },
    };

    for (const repository of [
      'jussray/Sekret-Bip',
      'jussray/StoryEngine',
      'jussray/jbh-private',
      'jussray/promptos',
      'jussray/solcontinuity',
    ]) {
      const proofUrl = `https://github.com/${repository}/commit/${SHA}`;
      const result = evaluateFounderSignalAutomation(
        allOwnedGrant,
        candidate({
          repository,
          proofUrl,
          evidenceReceipt: {
            verified: true,
            provider: 'github',
            repository,
            sourceCommitSha: SHA,
            proofUrl,
          },
        }),
      );

      expect(result).toEqual({
        decision: 'auto-distribute',
        reasons: [],
        grantId: allOwnedGrant.id,
      });
    }

    const outsideOwner = evaluateFounderSignalAutomation(
      allOwnedGrant,
      candidate({
        repository: 'someone-else/private-repo',
        proofUrl: 'https://github.com/someone-else/private-repo/commit/' + SHA,
        evidenceReceipt: {
          verified: true,
          provider: 'github',
          repository: 'someone-else/private-repo',
          sourceCommitSha: SHA,
          proofUrl: 'https://github.com/someone-else/private-repo/commit/' + SHA,
        },
      }),
    );

    expect(outsideOwner.decision).toBe('blocked');
    expect(outsideOwner.reasons).toContain('repository is outside the grant scope');
  });


  it('allows automatic social distribution only with trusted evidence inside an approved route', () => {
    expect(evaluateFounderSignalAutomation(grant, candidate())).toEqual({
      decision: 'auto-distribute',
      reasons: [],
      grantId: grant.id,
    });
  });

  it('allows automatic investor email only for an approved CRM recipient with a specific why', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      candidate({
        channel: 'gmail',
        audienceSegment: 'preapproved-potential-investors',
        where: 'Gmail',
        recipientId: 'hubspot-contact-123',
        recipientSpecificWhy: 'Their seed thesis includes family technology and applied AI.',
      }),
    );

    expect(result.decision).toBe('auto-distribute');
    expect(result.reasons).toEqual([]);
  });

  it('routes incomplete investor outreach to review instead of sending', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      candidate({
        channel: 'gmail',
        audienceSegment: 'preapproved-potential-investors',
        where: 'Gmail',
      }),
    );

    expect(result.decision).toBe('review-only');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'investor recipient ID is required',
        'recipient-specific why is required for investor email',
      ]),
    );
  });

  it('blocks an investor recipient that is not explicitly approved by the grant', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      candidate({
        channel: 'gmail',
        audienceSegment: 'preapproved-potential-investors',
        where: 'Gmail',
        recipientId: 'hubspot-contact-unapproved',
        recipientSpecificWhy: 'A specific thesis match.',
      }),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toContain('investor recipient is outside the approved grant scope');
  });

  it('blocks cross-channel audience combinations that were never approved', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      candidate({ channel: 'gmail', audienceSegment: 'build-in-public', where: 'Gmail' }),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toContain('channel and audience route is outside the grant scope');
  });

  it('does not trust caller-supplied proof that is missing or mismatched', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      candidate({
        proofUrl: 'https://example.com/not-proof',
        evidenceReceipt: {
          verified: true,
          provider: 'github',
          repository: 'jussray/Sekret-Bip',
          sourceCommitSha: SHA,
          proofUrl: PROOF_URL,
        },
      }),
    );

    expect(result.decision).toBe('review-only');
    expect(result.reasons).toContain(
      'trusted evidence receipt must match repository, commit, and proof URL',
    );
  });

  it('blocks repositories outside the grant', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      candidate({
        repository: 'someone/unknown',
        evidenceReceipt: {
          verified: true,
          provider: 'github',
          repository: 'someone/unknown',
          sourceCommitSha: SHA,
          proofUrl: PROOF_URL,
        },
      }),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toContain('repository is outside the grant scope');
  });

  it('blocks a revoked grant immediately', () => {
    const result = evaluateFounderSignalAutomation({ ...grant, enabled: false }, candidate());

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toContain('automation grant is disabled');
  });
});
