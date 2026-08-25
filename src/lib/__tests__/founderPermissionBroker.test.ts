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

describe('Founder Permission Broker', () => {
  it('creates a proposal-bound pending request without granting authority', () => {
    const request = createFounderPermissionRequest({
      requestId: 'permission:mission-123',
      requestedBySurface: 'chatgpt',
      proposal,
      note: 'Please approve the exact merge candidate.',
    });
    expect(request.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(request.requestHash).toBe(founderPermissionRequestHash({
      requestId: request.requestId,
      requestedBySurface: request.requestedBySurface,
      proposal: request.proposal,
      note: request.note,
    }));
  });

  it('rejects malformed proposal identity before a request can enter the ledger', () => {
    expect(() => createFounderPermissionRequest({
      requestId: 'permission:bad-proposal',
      requestedBySurface: 'claude',
      proposal: { ...proposal, proposalHash: 'not-a-hash' },
    })).toThrow(/proposalHash/);
  });

  it('turns explicit founder approval into the canonical founder decision only', () => {
    const request = createFounderPermissionRequest({ requestId: 'permission:approve-123', requestedBySurface: 'chatgpt', proposal });
    const resolution = resolveFounderPermissionRequest({ request, decisionSurface: 'chatgpt', decision: 'approved' });
    expect(resolution.status).toBe('approved');
    expect(resolution.founderPermissionSatisfied).toBe(true);
    expect(resolution.decision.executionAuthorized).toBe(true);
    expect(resolution.decision.proposal).toEqual(request.proposal);
    expect(resolution.independentReviewSatisfied).toBeNull();
  });

  it('does not turn denial into execution authority', () => {
    const request = createFounderPermissionRequest({ requestId: 'permission:reject-123', requestedBySurface: 'claude', proposal });
    const resolution = resolveFounderPermissionRequest({ request, decisionSurface: 'claude', decision: 'rejected' });
    expect(resolution.status).toBe('rejected');
    expect(resolution.founderPermissionSatisfied).toBe(false);
    expect(resolution.decision.executionAuthorized).toBe(false);
    expect(resolution.independentReviewSatisfied).toBeNull();
  });

  it('rejects a tampered request before issuing a decision', () => {
    const request = createFounderPermissionRequest({ requestId: 'permission:tamper-123', requestedBySurface: 'perplexity', proposal });
    expect(() => resolveFounderPermissionRequest({
      request: { ...request, proposal: { ...request.proposal, expectedHeadSha: 'd'.repeat(40) } },
      decisionSurface: 'perplexity',
      decision: 'approved',
    })).toThrow(/request hash/);
  });
});
