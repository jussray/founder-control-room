import { describe, expect, it } from 'vitest';
import { jiraActionClaimKey } from '../jiraActionIdentity.js';
import type { JiraWorkAutomationPlan } from '../jiraWorkAutomation.js';

function plan(): JiraWorkAutomationPlan {
  return {
    idempotencyKey: `fcr-jira-v1:${'a'.repeat(64)}`,
    actions: [{ type: 'assign-owner', ownerLabel: 'sekretbip', ownerAccountId: 'account-1' }],
  } as JiraWorkAutomationPlan;
}

describe('native Jira claim identity', () => {
  it('derives a stable key for repeated delivery of the same plan', () => {
    expect(jiraActionClaimKey(plan())).toBe(jiraActionClaimKey(plan()));
    expect(jiraActionClaimKey(plan())).toMatch(/^fcr-jira-[0-9a-f]{64}$/);
  });
  it('separates distinct external mutations', () => {
    const next = plan();
    next.actions = [{ type: 'assign-owner', ownerLabel: 'sekretbip', ownerAccountId: 'account-2' }];
    expect(jiraActionClaimKey(next)).not.toBe(jiraActionClaimKey(plan()));
  });
  it('rejects zero or multiple writes under one claim', () => {
    const empty = plan();
    empty.actions = [];
    expect(() => jiraActionClaimKey(empty)).toThrow('jira_claim_requires_exactly_one_action');
    const multiple = plan();
    multiple.actions = [plan().actions[0], plan().actions[0]];
    expect(() => jiraActionClaimKey(multiple)).toThrow('jira_claim_requires_exactly_one_action');
  });
  it('rejects untrusted plan identity', () => {
    const invalid = plan();
    invalid.idempotencyKey = 'untrusted';
    expect(() => jiraActionClaimKey(invalid)).toThrow('jira_claim_invalid_plan_identity');
  });
});
