import type {
  ContinuityTransitionV0,
  MainEvidenceDecisionV0,
  Sha256,
} from './contracts.v0.js';

export function createContinuityTransition(input: {
  prior?: MainEvidenceDecisionV0;
  next: MainEvidenceDecisionV0;
  evidenceFingerprint?: Sha256;
  priorTransitionId?: string;
  occurredAt: string;
  correlationId: string;
}): ContinuityTransitionV0 {
  if (input.prior && (input.prior.repo !== input.next.repo || input.prior.branch !== input.next.branch)) {
    throw new Error('CONTINUITY_INVALID: prior and next decisions must belong to the same repository branch');
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    throw new Error('CONTINUITY_INVALID: occurredAt must be a valid timestamp');
  }
  if (!input.correlationId.trim()) {
    throw new Error('CONTINUITY_INVALID: correlationId is required');
  }

  return Object.freeze({
    kind: 'continuity-transition.v0',
    repo: input.next.repo,
    branch: input.next.branch,
    from: input.prior?.state,
    to: input.next.state,
    reason: input.next.reason,
    authoritativeSha: input.next.authoritativeSha,
    lastVerifiedSha: input.next.lastVerifiedSha,
    policyHash: input.next.policyHash,
    evidenceFingerprint: input.evidenceFingerprint,
    priorTransitionId: input.priorTransitionId,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId,
  });
}
