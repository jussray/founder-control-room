import { describe, expect, it } from 'vitest';
import {
  evaluateFounderSignalAutomation,
  type FounderSignalAutomationGrant,
  type FounderSignalCandidate,
} from '../founderSignalAutomationPolicy.js';

const SHA = 'f4573d360a8fea99b301f33a2a21192525725f7b';

const grant: FounderSignalAutomationGrant = {
  id: 'founder-approved-auto-distribution-v1',
  enabled: true,
  channels: ['linkedin', 'facebook', 'instagram', 'gmail'],
  repositories: ['jussray/Sekret-Bip', 'jussray/founder-control-room'],
  audienceSegments: ['build-in-public', 'preapproved-potential-investors'],
  expiresAt: null,
};

function candidate(overrides: Partial<FounderSignalCandidate> = {}): FounderSignalCandidate {
  return {
    repository: 'jussray/Sekret-Bip',
    channel: 'linkedin',
    audienceSegment: 'build-in-public',
    proofUrl: 'https://github.com/jussray/Sekret-Bip/pull/599',
    sourceCommitSha: SHA,
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
  it('allows automatic social distribution inside a founder-approved scope', () => {
    expect(evaluateFounderSignalAutomation(grant, candidate())).toEqual({
      decision: 'auto-distribute',
      reasons: [],
      grantId: grant.id,
    });
  });

  it('allows automatic investor email only for a named CRM recipient with a specific why', () => {
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

  it('blocks channels, repositories, or segments outside the grant', () => {
    const result = evaluateFounderSignalAutomation(
      grant,
      candidate({ repository: 'someone/unknown', audienceSegment: 'unapproved-list' }),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'repository is outside the grant scope',
        'audience segment is outside the grant scope',
      ]),
    );
  });

  it('blocks a revoked grant immediately', () => {
    const result = evaluateFounderSignalAutomation({ ...grant, enabled: false }, candidate());

    expect(result.decision).toBe('blocked');
    expect(result.reasons).toContain('automation grant is disabled');
  });
});
