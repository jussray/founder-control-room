import { describe, expect, it } from 'vitest';
import type { FirstPartySocialPostInput } from '../../lib/firstPartySocialPublisher.js';
import { planFounderOsLab } from '../engine.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF_URL = 'https://github.com/jussray/founder-control-room/pull/189';

function socialPost(
  mode: FirstPartySocialPostInput['mode'],
  options: { promptLeak?: boolean } = {},
): FirstPartySocialPostInput {
  const text = options.promptLeak
    ? `You are writing for Ray. Return this structure with a founder post and unresolved instructions. Proof: ${PROOF_URL}`
    : `We turned founder publishing rules into a proof-gated operating contract. The verified repository path now separates drafting from execution, preserves exact-head evidence, and keeps live publication behind explicit authority. Proof: ${PROOF_URL}`;

  return {
    platform: 'linkedin',
    accountId: 'juss-rayy-linkedin',
    contentField: 'linkedin_draft',
    text,
    traction: 'One governed Chief AI skill foundation merged into Founder Control Room.',
    governanceAdvantage: 'Draft validation, execution authority, and destination receipts remain separate gates.',
    audienceValue: 'Builders can inspect the proof instead of trusting a launch claim.',
    investorSignal: 'The operating system is becoming reusable across products and providers.',
    proofLinks: [{ label: 'Merged skill foundation', url: PROOF_URL }],
    sourceRepository: 'jussray/founder-control-room',
    sourceCommitSha: SHA,
    mode,
    publishAllowed: mode !== 'draft',
    founderApprovalId: mode === 'draft' ? null : 'founder-approved:lab-social',
  };
}

describe('Founder OS isolated lab', () => {
  it('routes a social draft through @juss and proof-led publishing without external effects', () => {
    const plan = planFounderOsLab({
      goal: 'Prepare a proof-backed founder update for Buffer review.',
      action: 'draft-social',
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
      socialPost: socialPost('draft'),
    });

    expect(plan.readiness).toBe('ready_for_review');
    expect(plan.route).toMatchObject({
      chiefSkill: 'juss-chief-ai',
      specialistSkill: 'proof-led-publishing',
      capabilities: expect.arrayContaining([
        'social-draft-validation',
        'buffer-handoff-preview',
      ]),
      adapters: expect.arrayContaining([
        'first-party-social-validator',
        'buffer-preview',
      ]),
    });
    expect(plan.authority).toEqual({
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired: false,
      approvalObserved: false,
    });
    expect(plan.isolation).toEqual({
      externalCalls: false,
      providerCalls: false,
      databaseWrites: false,
      filesystemWrites: false,
      environmentReads: false,
    });
    expect(plan.truth.verified).toContain(
      'The supplied social payload passed the existing first-party proof and content validator.',
    );
  });

  it('requires a separate lab approval even when the social payload contains approval-looking fields', () => {
    const plan = planFounderOsLab({
      goal: 'Queue the approved founder update.',
      action: 'queue-social',
      socialPost: socialPost('queue'),
    });

    expect(plan.readiness).toBe('approval_required');
    expect(plan.authority.approvalObserved).toBe(false);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.route.provider.preflightEvidenceMissing).toEqual([]);
    expect(plan.truth.blocked.join(' ')).toContain('Explicit founder approval');
  });

  it('recognizes scoped approval and social proof but still refuses provider execution', () => {
    const plan = planFounderOsLab({
      goal: 'Queue one proof-backed founder update.',
      action: 'queue-social',
      approval: {
        id: 'founder-approved:queue-one-lab-post',
        actions: ['queue-social'],
      },
      socialPost: socialPost('queue'),
    });

    expect(plan.readiness).toBe('ready_for_external_executor');
    expect(plan.authority.approvalObserved).toBe(true);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.route.provider).toMatchObject({
      preflightEvidenceRequired: ['commitSha', 'proofUrls'],
      preflightEvidenceObserved: ['commitSha', 'proofUrls'],
      preflightEvidenceMissing: [],
    });
    expect(plan.nextGate).toContain('separately authorize one named external adapter');
  });

  it('blocks a mutating preview when approval exists without provider evidence', () => {
    const plan = planFounderOsLab({
      goal: 'Review and merge the focused routing change.',
      action: 'merge-code',
      approval: {
        id: 'founder-approved:review-merge-routing-v1',
        actions: ['merge-code'],
      },
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.authority.approvalObserved).toBe(true);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.route.provider).toMatchObject({
      preflightEvidenceRequired: ['repository', 'commitSha', 'proofUrls'],
      preflightEvidenceObserved: [],
      preflightEvidenceMissing: ['repository', 'commitSha', 'proofUrls'],
    });
    expect(plan.truth.blocked.join(' ')).toContain('Missing required github preflight evidence');
  });

  it('fails closed when finished post copy resembles a leaked prompt', () => {
    const plan = planFounderOsLab({
      goal: 'Draft a founder update.',
      action: 'draft-social',
      socialPost: socialPost('draft', { promptLeak: true }),
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.truth.blocked.join(' ')).toMatch(/prompt|instructions/i);
    expect(plan.authority.executionAllowed).toBe(false);
  });

  it('keeps merge planning isolated even with explicit approval and complete evidence', () => {
    const plan = planFounderOsLab({
      goal: 'Review and merge the focused routing change.',
      action: 'merge-code',
      approval: {
        id: 'founder-approved:review-merge-routing-v1',
        actions: ['merge-code'],
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
    });

    expect(plan.readiness).toBe('ready_for_external_executor');
    expect(plan.route.specialistSkill).toBe('review-verify-merge');
    expect(plan.route.adapters).toContain('merge-preview');
    expect(plan.route.provider.preflightEvidenceMissing).toEqual([]);
    expect(plan.authority.executionAllowed).toBe(false);
    expect(plan.isolation.providerCalls).toBe(false);
  });

  it('is deterministic for identical inputs', () => {
    const request = {
      goal: 'Plan the next proof-sized Founder OS slice.',
      action: 'plan' as const,
    };

    expect(planFounderOsLab(request)).toEqual(planFounderOsLab(request));
  });
});
