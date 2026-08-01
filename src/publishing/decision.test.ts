import { describe, expect, it } from 'vitest';
import type { ProofEngineSnapshot } from '../proof-engine/readiness.js';
import {
  buildPublishingDecision,
  type PublishingIntent,
} from './decision.js';

const readyProof = (status: ProofEngineSnapshot['status'] = 'ready'): ProofEngineSnapshot => ({
  projectSlug: 'founder-control-room',
  score: status === 'ready' ? 100 : status === 'conditional' ? 75 : 0,
  status,
  signals: [
    {
      id: 'github-main',
      provider: 'github',
      label: 'main branch proof',
      status: status === 'blocked' ? 'blocked' : 'verified',
      evidence: ['https://github.com/jussray/founder-control-room/commit/abc1234'],
      checkedAt: '2026-08-01T12:00:00.000Z',
    },
  ],
  blockers: status === 'blocked' ? ['github: main branch proof'] : [],
  generatedAt: '2026-08-01T12:01:00.000Z',
});

const completeIntent = (
  overrides: Partial<PublishingIntent> = {},
): PublishingIntent => ({
  projectSlug: 'founder-control-room',
  eventId: 'pr-190',
  summary: 'Founder Publishing OS v1 was verified on the exact repository head.',
  requestedMode: 'publish',
  audiences: ['investors', 'founders'],
  platforms: ['linkedin', 'facebook_founder'],
  traction: [
    {
      id: 'qualified-interest-1',
      kind: 'qualified_interest',
      label: 'Investor requested the governed publishing workflow',
      value: '1 qualified founder request',
      sourceUrl: 'https://example.com/traction-proof',
    },
  ],
  governanceAdvantages: [
    {
      id: 'approval-gate',
      label: 'Exact proof and founder approval gate publication',
      proofUrl: 'https://github.com/jussray/founder-control-room/pull/190',
    },
  ],
  founderApprovalId: 'founder-approval-190',
  ...overrides,
});

describe('buildPublishingDecision', () => {
  it('blocks public packaging when traction and governance proof are missing', () => {
    const decision = buildPublishingDecision(
      readyProof(),
      completeIntent({ traction: [], governanceAdvantages: [] }),
    );

    expect(decision.status).toBe('blocked');
    expect(decision.recommendedMode).toBe('internal_only');
    expect(decision.blockers).toContain(
      'missing verified traction; execution activity must not be relabeled as traction',
    );
    expect(decision.blockers).toContain('missing governance advantage with proof');
  });

  it('caps conditional proof at a reviewable draft', () => {
    const decision = buildPublishingDecision(readyProof('conditional'), completeIntent());

    expect(decision.status).toBe('draft_ready');
    expect(decision.recommendedMode).toBe('draft');
    expect(decision.publishAllowed).toBe(false);
  });

  it('requires a founder approval receipt before queue or publish', () => {
    const decision = buildPublishingDecision(
      readyProof(),
      completeIntent({ founderApprovalId: null }),
    );

    expect(decision.status).toBe('approval_required');
    expect(decision.recommendedMode).toBe('draft');
    expect(decision.publishAllowed).toBe(false);
  });

  it('authorizes the exact requested mode after proof and approval gates pass', () => {
    const decision = buildPublishingDecision(readyProof(), completeIntent());

    expect(decision.status).toBe('authorized');
    expect(decision.recommendedMode).toBe('publish');
    expect(decision.publishAllowed).toBe(true);
    expect(decision.contentRoutes).toEqual([
      { platform: 'linkedin', contentField: 'linkedin_draft' },
      { platform: 'facebook_founder', contentField: 'facebook_founder_draft' },
    ]);
  });

  it('blocks a proof snapshot from another project', () => {
    const decision = buildPublishingDecision(
      { ...readyProof(), projectSlug: 'sekret-bip' },
      completeIntent(),
    );

    expect(decision.status).toBe('blocked');
    expect(decision.blockers).toContain(
      'proof snapshot and publishing intent belong to different projects',
    );
  });
});
