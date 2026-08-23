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

function isValidTime(value: string | undefined): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function evaluateMainEvidence(input: EvaluationInput): MainEvidenceDecisionV0 {
  const authority = input.sourceAuthority;
  if (
    !authority
    || !authority.authoritativeSha
    || authority.repo !== input.repo
    || authority.branch !== 'main'
    || !isValidTime(authority.observedAt)
  ) {
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

  const duplicateWitnessIds = input.witnessResults
    .map((result) => result.witnessId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateWitnessIds.length > 0) {
    return decide(input, {
      state: 'BLOCKED',
      reason: 'INVALID_WITNESS_EVIDENCE',
      nextRequiredAction: 'RESOLVE_WITNESS_EVIDENCE',
      unresolvableWitnessIds: [...new Set(duplicateWitnessIds)],
    });
  }

  const results = new Map(input.witnessResults.map((result) => [result.witnessId, result]));
  const missing: string[] = [];
  const failed: string[] = [];
  const stale: string[] = [];
  const shaMismatched: string[] = [];
  const scenarioMismatched: string[] = [];
  const unresolvable: string[] = [];
  const invalid: string[] = [];

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
      scenarioMismatched.push(requirement.id);
      continue;
    }
    if (requirement.exactShaRequired && result.evaluatedSha !== authority.authoritativeSha) {
      shaMismatched.push(requirement.id);
      continue;
    }
    if (!result.evidenceRef || !result.evidenceHash || !isValidTime(result.observedAt)) {
      invalid.push(requirement.id);
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

    const observedAtMs = Date.parse(result.observedAt);
    const nowMs = Date.parse(input.now);
    const exceedsPolicyFreshness = requirement.freshnessWindowSeconds !== undefined
      && Number.isFinite(nowMs)
      && (nowMs - observedAtMs) > requirement.freshnessWindowSeconds * 1000;
    const explicitExpiry = isValidTime(result.expiresAt) && Date.parse(result.expiresAt) <= nowMs;

    if (result.state === 'STALE' || exceedsPolicyFreshness || explicitExpiry) {
      stale.push(requirement.id);
      continue;
    }
    if (result.state !== 'PASS') {
      unresolvable.push(requirement.id);
    }
  }

  if (invalid.length) {
    return decide(input, {
      state: 'BLOCKED',
      reason: 'INVALID_WITNESS_EVIDENCE',
      nextRequiredAction: 'RESOLVE_WITNESS_EVIDENCE',
      unresolvableWitnessIds: invalid,
    });
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
  if (scenarioMismatched.length) {
    return decide(input, {
      state: 'STALE',
      reason: 'SCENARIO_MISMATCH',
      nextRequiredAction: 'REACQUIRE_REQUIRED_WITNESSES',
      mismatchedWitnessIds: scenarioMismatched,
    });
  }
  if (shaMismatched.length) {
    return decide(input, {
      state: 'STALE',
      reason: 'WITNESS_SHA_MISMATCH',
      nextRequiredAction: 'INVESTIGATE_SHA_MISMATCH',
      mismatchedWitnessIds: shaMismatched,
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
