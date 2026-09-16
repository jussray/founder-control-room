export const GOVERNED_ACTION_AUTHORIZATION_SCHEMA = 'fcr/governed-action-authorization@v1' as const;

export type GovernedActionClass =
  | 'read'
  | 'analyze'
  | 'draft'
  | 'write_local'
  | 'write_external'
  | 'execute'
  | 'deploy'
  | 'delete';

export interface GovernedActionGrant {
  actionId: string;
  actionClass: GovernedActionClass;
  target: string;
  capability: string;
  reversible: boolean;
  requiresApproval: boolean;
  approvalReceiptId?: string;
  evidenceRequired: boolean;
}

export interface GovernedActionAttempt {
  actionId: string;
  actionClass: GovernedActionClass;
  target: string;
  capability: string;
  approvalReceiptId?: string;
  approvalValid: boolean;
}

export interface GovernedActionAuthorizationDecision {
  disposition: 'EXECUTE' | 'DENY';
  reasons: readonly string[];
}

const CONSEQUENTIAL_ACTIONS = new Set<GovernedActionClass>([
  'write_external',
  'execute',
  'deploy',
  'delete',
]);

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function same(expected: string | undefined, actual: string | undefined): boolean {
  return normalized(expected) === normalized(actual);
}

/**
 * Validate one concrete tool/effect attempt against broker-owned action grants.
 *
 * Capability suitability never creates authority here. A capability must match the
 * already-approved action grant, while authorization remains independently bound to
 * the exact action id, class, target, and approval receipt. This function is intended
 * to run immediately before the consequential effect, after higher-level planning and
 * routing have already happened.
 */
export function evaluateGovernedActionAuthorization(
  grants: readonly GovernedActionGrant[],
  attempt: GovernedActionAttempt,
): GovernedActionAuthorizationDecision {
  const reasons = new Set<string>();
  const actionId = normalized(attempt.actionId);

  if (!actionId) {
    return { disposition: 'DENY', reasons: ['action_id_missing'] };
  }

  const matches = grants.filter((grant) => normalized(grant.actionId) === actionId);
  if (matches.length === 0) {
    return { disposition: 'DENY', reasons: ['action_not_granted'] };
  }
  if (matches.length !== 1) {
    return { disposition: 'DENY', reasons: ['duplicate_action_grant'] };
  }

  const grant = matches[0];
  if (grant.actionClass !== attempt.actionClass) reasons.add('action_class_drift');
  if (!same(grant.target, attempt.target)) reasons.add('action_target_drift');
  if (!same(grant.capability, attempt.capability)) reasons.add('action_capability_drift');

  const consequential = CONSEQUENTIAL_ACTIONS.has(attempt.actionClass);
  if (consequential && grant.requiresApproval !== true) {
    reasons.add('consequential_action_not_approval_bound');
  }
  if (consequential && grant.evidenceRequired !== true) {
    reasons.add('consequential_action_missing_evidence_requirement');
  }

  if (grant.requiresApproval || consequential) {
    const expectedReceipt = normalized(grant.approvalReceiptId);
    if (!expectedReceipt) reasons.add('approval_receipt_missing');
    if (attempt.approvalValid !== true) reasons.add('approval_invalid');
    if (!same(expectedReceipt, attempt.approvalReceiptId)) reasons.add('approval_receipt_drift');
  }

  return reasons.size > 0
    ? { disposition: 'DENY', reasons: [...reasons] }
    : { disposition: 'EXECUTE', reasons: [] };
}
