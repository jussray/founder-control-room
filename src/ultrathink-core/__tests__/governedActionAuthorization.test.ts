import { describe, expect, it } from 'vitest';

import {
  evaluateGovernedActionAuthorization,
  type GovernedActionGrant,
} from '../governedActionAuthorization.js';

const grant: GovernedActionGrant = {
  actionId: 'storyengine-event-log-write',
  actionClass: 'write_external',
  target: 'jussray/StoryEngine#control-room:event-log',
  capability: 'founder-control-room-federation',
  reversible: true,
  requiresApproval: true,
  approvalReceiptId: 'founder-decision-exact',
  evidenceRequired: true,
};

function attempt(overrides: Partial<Parameters<typeof evaluateGovernedActionAuthorization>[1]> = {}) {
  return {
    actionId: grant.actionId,
    actionClass: grant.actionClass,
    target: grant.target,
    capability: grant.capability,
    approvalReceiptId: grant.approvalReceiptId,
    approvalValid: true,
    ...overrides,
  };
}

describe('per-action authorization membrane', () => {
  it('allows only the exact approval-bound action', () => {
    expect(evaluateGovernedActionAuthorization([grant], attempt())).toEqual({
      disposition: 'EXECUTE',
      reasons: [],
    });
  });

  it('blocks capability-to-authority laundering', () => {
    const deployAttempt = attempt({
      actionClass: 'deploy',
      target: 'production',
      capability: 'provider.deploy',
    });
    const result = evaluateGovernedActionAuthorization([grant], deployAttempt);
    expect(result.disposition).toBe('DENY');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'action_class_drift',
      'action_target_drift',
      'action_capability_drift',
    ]));
  });

  it('blocks an external mutation hidden inside an otherwise approved plan', () => {
    const result = evaluateGovernedActionAuthorization([grant], attempt({
      actionId: 'create-github-issue',
      target: 'github:jussray/founder-control-room#issues',
    }));
    expect(result).toEqual({
      disposition: 'DENY',
      reasons: ['action_not_granted'],
    });
  });

  it('blocks target drift even when capability and approval are unchanged', () => {
    const result = evaluateGovernedActionAuthorization([grant], attempt({
      target: 'jussray/StoryEngine#provider:deploy',
    }));
    expect(result).toMatchObject({ disposition: 'DENY' });
    expect(result.reasons).toContain('action_target_drift');
  });

  it('blocks stale or substituted approval receipts at the effect boundary', () => {
    const result = evaluateGovernedActionAuthorization([grant], attempt({
      approvalReceiptId: 'different-founder-decision',
      approvalValid: false,
    }));
    expect(result.disposition).toBe('DENY');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'approval_invalid',
      'approval_receipt_drift',
    ]));
  });

  it('refuses a consequential grant that tries to omit approval or evidence', () => {
    const unsafeGrant: GovernedActionGrant = {
      ...grant,
      requiresApproval: false,
      approvalReceiptId: undefined,
      evidenceRequired: false,
    };
    const result = evaluateGovernedActionAuthorization([unsafeGrant], attempt({
      approvalReceiptId: undefined,
    }));
    expect(result.disposition).toBe('DENY');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'consequential_action_not_approval_bound',
      'consequential_action_missing_evidence_requirement',
      'approval_receipt_missing',
      'approval_receipt_drift',
    ]));
  });

  it('treats duplicate action grants as ambiguous instead of picking one', () => {
    expect(evaluateGovernedActionAuthorization([grant, { ...grant }], attempt())).toEqual({
      disposition: 'DENY',
      reasons: ['duplicate_action_grant'],
    });
  });
});
