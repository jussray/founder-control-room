import type {
  MainEvidenceDecisionV0,
  RecoveryActionV0,
  SourceAuthorityV0,
  WitnessPolicyV0,
  WitnessResultV0,
} from './contracts.v0.js';

type EvaluationInput = {
  now: string;
  repo: string;
  correlationId: string;
  sourceAuthority?: SourceAuthorityV0;
  prior?: MainEvidenceDecisionV0;
  policy: WitnessPolicyV0;
  witnessResults: readonly WitnessResultV0[];
};

type DecisionPatch = Pick<MainEvidenceDecisionV0, 'state' | 'reason'> & {
  nextRequiredAction: RecoveryActionV0;
  missingWitnessIds?: string[];
  failedWitnessIds?: string[];
  staleWitnessIds?: string[];
  mismatchedWitnessIds?: string[];
  unresolvableWitnessIds?: string[];
};

function decide(input: EvaluationInput, patch: DecisionPatch): MainEvidenceDecisionV0 {
  const authoritativeSha = input.sourceAuthority?.authoritativeSha;
  const lastVerifiedSha = patch.state === 'VERIFIED'
    ? authoritativeSha
    : input.prior?.lastVerifiedSha;

  return {
    kind: 'main-evidence-decision.v0',
    repo: input.repo,
    branch: 'main',
    authoritativeSha,
    lastVerifiedSha,
    state: patch.state,
    reason: patch.reason,
    policyHash: input.policy.policyHash,
    missingWitnessIds: patch.missingWitnessIds ?? [],
    failedWitnessIds: patch.failedWitnessIds ?? [],
    staleWitnessIds: patch.staleWitnessIds ?? [],
    mismatchedWitnessIds: patch.mismatchedWitnessIds ?? [],
    unresolvableWitnessIds: patch.unresolvableWitnessIds ?? [],
    nextRequiredAction: patch.nextRequiredAction,
    evaluatedAt: input.now,
    correlationId: input.correlationId,
  };
}

export function evaluateMainEvidence(input: EvaluationInput): MainEvidenceDecisionV0 {
  const authority = input.sourceAuthority;
  if (!authority || !authority.authoritativeSha || authority.repo !== input.repo || authority.branch !== 'main') {
    return decide(input, {
      state: 'BLOCKED',
      reason: 'SOURCE_AUTHORITY_UNRESOLVED',
      nextRequiredAction: 'RESOLVE_SOURCE_AUTHORITY',
    });
  }

  if (input.prior && input.prior.policyHash !== input.policy.policyHash) {
    return decide(input, {
      state: 'UNKNOWN',
      reason: 'POLICY_CHANGED',
      nextRequiredAction: 'REVIEW_POLICY_CHANGE',
      missingWitnessIds: input.policy.requiredWitnesses.map((witness) => witness.id),
    });
  }

  const results = new Map(input.witnessResults.map((result) => [result.witnessId, result]));
  const missing: string[] = [];
  const failed: string[] = [];
  const stale: string[] = [];
  const mismatched: string[] = [];
  const unresolvable: string[] = [];

  for (const requirement of input.policy.requiredWitnesses) {
    const result = results.get(requirement.id);
    if (!result || result.state === 'MISSING') {
      missing.push(requirement.id);
      continue;
    }
    if (result.policyHash !== input.policy.policyHash) {
      stale.push(requirement.id);
      continue;
    }
    if (requirement.scenarioFingerprint && result.scenarioFingerprint !== requirement.scenarioFingerprint) {
      mismatched.push(requirement.id);
      continue;
    }
    if (requirement.exactShaRequired && result.evaluatedSha !== authority.authoritativeSha) {
      mismatched.push(requirement.id);
      continue;
    }
    if (!result.evidenceRef || !result.evidenceHash || !result.observedAt) {
      unresolvable.push(requirement.id);
      continue;
    }
    if (result.state === 'UNRESOLVABLE') {
      unresolvable.push(requirement.id);
      continue;
    }
    if (result.state === 'FAIL') {
      failed.push(requirement.id);
      continue;
    }
    if (result.state === 'STALE' || (result.expiresAt && result.expiresAt <= input.now)) {
      stale.push(requirement.id);
      continue;
    }
    if (result.state !== 'PASS') {
      unresolvable.push(requirement.id);
    }
  }

  if (unresolvable.length) {
    return decide(input, {
      state: 'BLOCKED',
      reason: 'WITNESS_UNRESOLVABLE',
      nextRequiredAction: 'RESOLVE_WITNESS_EVIDENCE',
      unresolvableWitnessIds: unresolvable,
    });
  }
  if (failed.length) {
    return decide(input, {
      state: 'BLOCKED',
      reason: 'WITNESS_FAILED',
      nextRequiredAction: 'RETRY_FAILED_WITNESS',
      failedWitnessIds: failed,
    });
  }
  if (mismatched.length) {
    return decide(input, {
      state: 'STALE',
      reason: 'WITNESS_SHA_MISMATCH',
      nextRequiredAction: 'INVESTIGATE_SHA_MISMATCH',
      mismatchedWitnessIds: mismatched,
    });
  }
  if (stale.length) {
    return decide(input, {
      state: 'STALE',
      reason: 'EVIDENCE_EXPIRED',
      nextRequiredAction: 'REACQUIRE_REQUIRED_WITNESSES',
      staleWitnessIds: stale,
    });
  }
  if (missing.length) {
    const mainAdvanced = Boolean(input.prior?.lastVerifiedSha && input.prior.lastVerifiedSha !== authority.authoritativeSha);
    return decide(input, {
      state: mainAdvanced ? 'STALE' : 'UNKNOWN',
      reason: mainAdvanced ? 'MAIN_SHA_CHANGED' : 'REQUIRED_WITNESS_MISSING',
      nextRequiredAction: 'REACQUIRE_REQUIRED_WITNESSES',
      missingWitnessIds: missing,
    });
  }

  return decide(input, {
    state: 'VERIFIED',
    reason: 'RECOVERY_COMPLETE',
    nextRequiredAction: 'NO_ACTION_REQUIRED',
  });
}
