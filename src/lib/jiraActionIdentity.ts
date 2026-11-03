import { createHash } from 'node:crypto';
import type { JiraWorkAutomationPlan } from './jiraWorkAutomation.js';

/**
 * Derive the permanent per-mutation claim identity from a validated plan.
 * A plan is currently limited to one action, so the key cannot ambiguously
 * cover multiple external writes. Do not derive keys from delivery timestamps.
 */
export function jiraActionClaimKey(plan: JiraWorkAutomationPlan): string {
  if (plan.actions.length !== 1) throw new Error('jira_claim_requires_exactly_one_action');
  if (!/^fcr-jira-v1:[0-9a-f]{64}$/.test(plan.idempotencyKey)) {
    throw new Error('jira_claim_invalid_plan_identity');
  }
  const action = plan.actions[0];
  if (action.type !== 'assign-owner' && action.type !== 'comment-stale') {
    throw new Error('jira_claim_unsupported_action');
  }
  const digest = createHash('sha256')
    .update(JSON.stringify({ id: plan.idempotencyKey, action }), 'utf8')
    .digest('hex');
  return `fcr-jira-${digest}`;
}
