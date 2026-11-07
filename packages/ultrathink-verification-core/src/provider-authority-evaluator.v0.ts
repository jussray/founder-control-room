import type {
  ProviderAuthorityEvaluationInputV0,
  ProviderAuthorityReceiptV0,
} from './provider-authority-receipt.v0.js';

const normalize = (values: readonly string[]): string[] => [...new Set(values)].sort();

export function evaluateProviderAuthorityV0(
  input: ProviderAuthorityEvaluationInputV0,
): ProviderAuthorityReceiptV0 {
  const reasons: string[] = [];
  const unknown: string[] = [];
  const expectedEvidence = normalize(input.expectation.requiredEvidence);
  const allowedBypass = new Set(input.expectation.allowedBypassPrincipals);

  const observation = {
    ...input.observation,
    requiredEvidence: input.observation.requiredEvidence === null
      ? null
      : normalize(input.observation.requiredEvidence),
    bypassPrincipals: input.observation.bypassPrincipals === null
      ? null
      : normalize(input.observation.bypassPrincipals),
  };

  if (observation.requiresChangeRequest === null) unknown.push('OBSERVATION_CHANGE_REQUEST_UNKNOWN');
  else if (observation.requiresChangeRequest !== input.expectation.requiresChangeRequest) reasons.push('CHANGE_REQUEST_POLICY_MISMATCH');

  if (observation.minimumApprovals === null) unknown.push('OBSERVATION_APPROVAL_COUNT_UNKNOWN');
  else if (observation.minimumApprovals < input.expectation.minimumApprovals) reasons.push('APPROVAL_COUNT_TOO_LOW');

  if (observation.requiresFreshApproval === null) unknown.push('OBSERVATION_FRESH_APPROVAL_UNKNOWN');
  else if (input.expectation.requiresFreshApproval && !observation.requiresFreshApproval) reasons.push('FRESH_APPROVAL_NOT_ENFORCED');

  if (observation.requiresConversationResolution === null) unknown.push('OBSERVATION_CONVERSATION_RESOLUTION_UNKNOWN');
  else if (input.expectation.requiresConversationResolution && !observation.requiresConversationResolution) reasons.push('CONVERSATION_RESOLUTION_NOT_ENFORCED');

  if (observation.requiresStrictEvidence === null) unknown.push('OBSERVATION_STRICT_EVIDENCE_UNKNOWN');
  else if (input.expectation.requiresStrictEvidence && !observation.requiresStrictEvidence) reasons.push('STRICT_EVIDENCE_NOT_ENFORCED');

  if (observation.requiredEvidence === null) {
    unknown.push('OBSERVATION_REQUIRED_EVIDENCE_UNKNOWN');
  } else {
    for (const required of expectedEvidence) {
      if (!observation.requiredEvidence.includes(required)) reasons.push(`REQUIRED_EVIDENCE_MISSING:${required}`);
    }
  }

  if (observation.bypassPrincipals === null) {
    unknown.push('OBSERVATION_BYPASS_PRINCIPALS_UNKNOWN');
  } else {
    for (const principal of observation.bypassPrincipals) {
      if (!allowedBypass.has(principal)) reasons.push(`UNEXPECTED_BYPASS_PRINCIPAL:${principal}`);
    }
  }

  if (input.expectation.minimumApprovals > 0) {
    if (input.behavior.blockedWithoutApproval === null) unknown.push('BEHAVIOR_ZERO_APPROVAL_BLOCK_UNKNOWN');
    else if (!input.behavior.blockedWithoutApproval) reasons.push('BEHAVIOR_ZERO_APPROVAL_NOT_BLOCKED');

    if (input.behavior.allowedWithApproval === null) unknown.push('BEHAVIOR_APPROVED_HEAD_ELIGIBILITY_UNKNOWN');
    else if (!input.behavior.allowedWithApproval) reasons.push('BEHAVIOR_APPROVED_HEAD_NOT_ELIGIBLE');
  }

  if (input.expectation.requiresFreshApproval) {
    if (input.behavior.staleApprovalBlocked === null) unknown.push('BEHAVIOR_STALE_APPROVAL_BLOCK_UNKNOWN');
    else if (!input.behavior.staleApprovalBlocked) reasons.push('BEHAVIOR_STALE_APPROVAL_NOT_BLOCKED');
  }

  const decision = reasons.length > 0
    ? { state: 'DRIFT' as const, reasons: normalize(reasons) }
    : unknown.length > 0
      ? { state: 'UNKNOWN' as const, reasons: normalize(unknown) }
      : { state: 'VERIFIED' as const, reasons: ['PROVIDER_AUTHORITY_MATCH'] };

  return {
    version: 0,
    provider: input.provider,
    resource: input.resource,
    target: input.target,
    candidateSha: input.candidateSha,
    observedAt: input.observedAt,
    expectation: {
      ...input.expectation,
      requiredEvidence: expectedEvidence,
      allowedBypassPrincipals: normalize(input.expectation.allowedBypassPrincipals),
    },
    observation,
    behavior: { ...input.behavior },
    decision,
    evidenceRefs: normalize(input.evidenceRefs),
  };
}
