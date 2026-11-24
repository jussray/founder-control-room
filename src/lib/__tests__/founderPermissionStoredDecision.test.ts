import { describe, expect, it } from 'vitest';
import {
  createFounderPermissionRequest,
  resolveFounderPermissionRequest,
} from '../founderPermissionBroker.js';
import { storedFounderPermissionDecisionMatches } from '../founderPermissionStoredDecision.js';

const request = createFounderPermissionRequest({
  requestId: 'permission:stored-decision-001',
  requestedBySurface: 'chatgpt',
  proposal: {
    proposalId: 'proposal-stored-decision',
    proposalHash: 'a'.repeat(64),
    projectSlug: 'founder-control-room',
    actionType: 'merge',
    expectedHeadSha: 'b'.repeat(40),
    capabilityPlanHash: 'c'.repeat(64),
  },
  actionTarget: {
    type: 'merge',
    repo: 'jussray/founder-control-room',
    pullRequestNumber: 733,
    baseSha: 'd'.repeat(40),
    headSha: 'b'.repeat(40),
  },
});

const approved = resolveFounderPermissionRequest({ request, decision: 'approved' });

describe('stored founder permission decision integrity', () => {
  it('accepts only the exact canonical durable decision', () => {
    expect(storedFounderPermissionDecisionMatches(request, {
      status: 'approved',
      decision: approved.decision,
      decisionHash: approved.decision.decisionHash,
      decisionSurface: 'fcr',
    })).toBe(true);
  });

  it.each([
    ['forged execution flag', { ...approved.decision, executionAuthorized: true }, approved.decision.decisionHash, 'fcr'],
    ['forged embedded hash', { ...approved.decision, decisionHash: 'e'.repeat(64) }, approved.decision.decisionHash, 'fcr'],
    ['wrong outer hash', approved.decision, 'e'.repeat(64), 'fcr'],
    ['wrong surface', approved.decision, approved.decision.decisionHash, 'chatgpt'],
  ] as const)('rejects %s', (_label, decision, decisionHash, decisionSurface) => {
    expect(storedFounderPermissionDecisionMatches(request, {
      status: 'approved',
      decision,
      decisionHash,
      decisionSurface,
    })).toBe(false);
  });

  it('rejects status drift from the canonical decision', () => {
    expect(storedFounderPermissionDecisionMatches(request, {
      status: 'rejected',
      decision: approved.decision,
      decisionHash: approved.decision.decisionHash,
      decisionSurface: 'fcr',
    })).toBe(false);
  });
});
