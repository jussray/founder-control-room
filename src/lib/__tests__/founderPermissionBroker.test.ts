import { describe, expect, it } from 'vitest';
import {
  createFounderPermissionRequest,
  founderPermissionRequestHash,
  resolveFounderPermissionRequest,
} from '../founderPermissionBroker.js';

const proposal = {
  proposalId: 'mission-123',
  proposalHash: 'a'.repeat(64),
  projectSlug: 'founder-control-room',
  actionType: 'merge',
  expectedHeadSha: 'b'.repeat(40),
  capabilityPlanHash: 'c'.repeat(64),
};

const actionTarget = {
  type: 'merge' as const,
  repo: 'jussray/founder-control-room',
  pullRequestNumber: 727,
  baseSha: 'd'.repeat(40),
  headSha: 'b'.repeat(40),
};

describe('Founder Permission Broker', () => {
  it('creates an exact-target pending request without granting authority', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:mission-123',
      requestedBySurface: 'chatgpt',
      proposal,
      actionTarget,
      note: 'Please approve the exact merge candidate.',
    });
    expect(request.actionTarget).toEqual(actionTarget);
    expect(request.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.requestHash).toBe(founderPermissionRequestHash({
      requestId: request.requestId,
      requestedBySurface: request.requestedBySurface,
      proposal: request.proposal,
      actionTarget: request.actionTarget,
      note: request.note,
    }));
  });

  it('rejects malformed proposal identity before a request can enter the ledger', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:bad-proposal',
      requestedBySurface: 'claude',
      proposal: { ...proposal, proposalHash: 'not-a-hash' },
      actionTarget,
    })).toThrow(/proposalHash/);
  });

  it('fails closed when merge scope omits the exact repository and PR target', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:missing-target',
      requestedBySurface: 'chatgpt',
      proposal,
    })).toThrow(/exact merge actionTarget/);
  });

  it('fails closed when the merge target head disagrees with the proposal head', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:wrong-target-head',
      requestedBySurface: 'chatgpt',
      proposal,
      actionTarget: { ...actionTarget, headSha: 'e'.repeat(40) },
    })).toThrow(/expectedHeadSha must equal actionTarget headSha/);
  });

  it('records explicit founder approval as FCR provenance without execution authority', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:approve-123',
      requestedBySurface: 'chatgpt',
      proposal,
      actionTarget,
    });
    const resolution = resolveFounderPermissionRequest({ request, decision: 'approved' });
    expect(resolution.status).toBe('approved');
    expect(resolution.founderPermissionSatisfied).toBe(false);
    expect(resolution.decision.surface).toBe('fcr');
    expect(resolution.decision.executionAuthorized).toBe(false);
    expect(resolution.decision.requestHash).toBe(request.requestHash);
    expect(resolution.independentReviewSatisfied).toBeNull();
  });

  it('does not turn denial into execution authority', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:reject-123',
      requestedBySurface: 'claude',
      proposal,
      actionTarget,
    });
    const resolution = resolveFounderPermissionRequest({ request, decision: 'rejected' });
    expect(resolution.status).toBe('rejected');
    expect(resolution.founderPermissionSatisfied).toBe(false);
    expect(resolution.decision.executionAuthorized).toBe(false);
    expect(resolution.independentReviewSatisfied).toBeNull();
  });

  it('binds learning cross-domain approval to the exact later outcome, head and reason', () => {
    const learningProposal = {
      ...proposal, actionType: 'apply_learning_cross_domain',
      proposalId: 'learning-approval-1',
    };
    const learningTarget = {
      type: 'learning_application' as const,
      learningId: '11111111-1111-4111-8111-111111111111',
      targetMissionId: '22222222-2222-4222-8222-222222222222',
      targetOutcomeId: '33333333-3333-4333-8333-333333333333',
      targetHeadSha: 'b'.repeat(40), targetDomain: 'auth',
      crossDomainReason: 'A shared verification race was observed in this domain.',
    };
    const request = createFounderPermissionRequest({
      requestId: 'permission:learning-cross-domain',
      requestedBySurface: 'chatgpt', proposal: learningProposal,
      actionTarget: learningTarget,
    });
    expect(request.actionTarget).toMatchObject(learningTarget);
    const approved = resolveFounderPermissionRequest({request, decision: 'approved'});
    expect(approved.decision.executionAuthorized).toBe(false);
    expect(() => resolveFounderPermissionRequest({
      request: {...request, actionTarget: {...learningTarget, targetOutcomeId: '44444444-4444-4444-8444-444444444444'}},
      decision: 'approved',
    })).toThrow(/request hash/);
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:learning-wrong-head',
      requestedBySurface: 'chatgpt',proposal:learningProposal,
      actionTarget: {...learningTarget,targetHeadSha:'c'.repeat(40)},
    })).toThrow(/must pin lesson/);
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:learning-no-reason',
      requestedBySurface: 'chatgpt',proposal:learningProposal,
      actionTarget: {...learningTarget,crossDomainReason:'no'},
    })).toThrow(/must pin lesson/);
  });

  it('binds retirement approval to the exact lesson and original head', () => {
    const retireProposal = {...proposal, actionType: 'retire_learning', proposalId: 'learning-retire-1'};
    const retireTarget = {
      type: 'learning_retirement' as const,
      learningId: '11111111-1111-4111-8111-111111111111',
      originHeadSha: 'b'.repeat(40),
    };
    const request = createFounderPermissionRequest({
      requestId: 'permission:learning-retirement',
      requestedBySurface: 'chatgpt', proposal: retireProposal,actionTarget:retireTarget,
    });
    expect(request.actionTarget).toEqual(retireTarget);
    expect(() => resolveFounderPermissionRequest({
      request: {...request, actionTarget: {...retireTarget,learningId:'22222222-2222-4222-8222-222222222222'}},
      decision:'approved',
    })).toThrow(/request hash/);
  });

  it('rejects a tampered request target before recording a decision', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:tamper-123',
      requestedBySurface: 'perplexity',
      proposal,
      actionTarget,
    });
    expect(() => resolveFounderPermissionRequest({
      request: {
        ...request,
        actionTarget: { ...actionTarget, pullRequestNumber: 728 },
      },
      decision: 'approved',
    })).toThrow(/request hash/);
  });
});
