import type { SourceAuthorityV0 } from './source-authority.v0.js';
import type { WitnessPolicyV0, WitnessRequirementV0 } from './witness-policy.v0.js';
import type { WitnessResultV0 } from './witness-result.v0.js';
import type { MainEvidenceDecisionV0, MainEvidenceReasonV0, MainEvidenceStateV0 } from './main-evidence-decision.v0.js';
import type { ContinuityTransitionV0 } from './continuity-transition.v0.js';
import type { VerificationProjectionV0 } from './verification-projection.v0.js';

export type EvaluateMainEvidenceInputV0 = {
  sourceAuthority?: SourceAuthorityV0 | null;
  policy: WitnessPolicyV0;
  witnesses: readonly WitnessResultV0[];
  now: string;
  correlationId: string;
  previousDecision?: MainEvidenceDecisionV0 | null;
};

export type EvaluateMainEvidenceOutputV0 = {
  decision: MainEvidenceDecisionV0;
  transition: ContinuityTransitionV0;
  projection: VerificationProjectionV0;
};

function validTime(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortWitnesses(results: readonly WitnessResultV0[]): WitnessResultV0[] {
  return [...results].sort((a, b) => {
    const id = a.witnessId.localeCompare(b.witnessId);
    if (id !== 0) return id;
    return a.correlationId.localeCompare(b.correlationId);
  });
}

function resultsFor(requirement: WitnessRequirementV0, results: readonly WitnessResultV0[]): WitnessResultV0[] {
  return results.filter((result) => result.witnessId === requirement.id);
}

function classifyRequirement(params: {
  requirement: WitnessRequirementV0;
  result?: WitnessResultV0;
  duplicate: boolean;
  authority: SourceAuthorityV0;
  policy: WitnessPolicyV0;
  nowMs: number;
}): { state: MainEvidenceStateV0; reason: MainEvidenceReasonV0 } | null {
  const { requirement, result, duplicate, authority, policy, nowMs } = params;
  if (duplicate) return { state: 'UNKNOWN', reason: 'INVALID_WITNESS_EVIDENCE' };
  if (!result || result.state === 'MISSING') return { state: 'UNKNOWN', reason: 'REQUIRED_WITNESS_MISSING' };
  if (result.state === 'FAIL') return { state: 'BLOCKED', reason: 'WITNESS_FAILED' };
  if (result.state === 'UNRESOLVABLE') return { state: 'BLOCKED', reason: 'WITNESS_UNRESOLVABLE' };
  if (result.state === 'STALE') return { state: 'STALE', reason: 'EVIDENCE_EXPIRED' };

  if (
    result.kind !== 'witness-result.v0' ||
    result.version !== 0 ||
    result.repo !== authority.repo ||
    result.repo !== policy.repo ||
    result.branch !== authority.branch ||
    !result.observer?.adapter ||
    !result.observer?.version ||
    !result.evaluatedSha ||
    !result.policyHash ||
    !result.evidenceRef ||
    !result.evidenceHash ||
    !result.observedAt
  ) {
    return { state: 'UNKNOWN', reason: 'INVALID_WITNESS_EVIDENCE' };
  }
  if (result.evaluatedSha !== authority.authoritativeSha) return { state: 'STALE', reason: 'WITNESS_SHA_MISMATCH' };
  if (result.policyHash !== policy.policyHash) return { state: 'STALE', reason: 'POLICY_CHANGED' };
  if (requirement.scenarioFingerprint && result.scenarioFingerprint !== requirement.scenarioFingerprint) {
    return { state: 'STALE', reason: 'SCENARIO_MISMATCH' };
  }

  const observedAtMs = validTime(result.observedAt);
  if (observedAtMs === null || observedAtMs > nowMs) return { state: 'UNKNOWN', reason: 'INVALID_WITNESS_EVIDENCE' };

  if (result.expiresAt) {
    const expiresAtMs = validTime(result.expiresAt);
    if (expiresAtMs === null) return { state: 'UNKNOWN', reason: 'INVALID_WITNESS_EVIDENCE' };
    if (expiresAtMs <= nowMs) return { state: 'STALE', reason: 'EVIDENCE_EXPIRED' };
  }

  if (requirement.freshnessWindowSeconds !== undefined) {
    if (requirement.freshnessWindowSeconds <= 0) return { state: 'UNKNOWN', reason: 'INVALID_WITNESS_EVIDENCE' };
    const maxAgeMs = requirement.freshnessWindowSeconds * 1000;
    if (nowMs - observedAtMs > maxAgeMs) return { state: 'STALE', reason: 'EVIDENCE_EXPIRED' };
  }

  return null;
}

const precedence: Record<MainEvidenceStateV0, number> = {
  VERIFIED: 0,
  UNKNOWN: 1,
  STALE: 2,
  BLOCKED: 3,
};

function projectionFor(decision: MainEvidenceDecisionV0): VerificationProjectionV0 {
  return Object.freeze({
    kind: 'verification-projection.v0',
    repo: decision.repo,
    authoritativeSha: decision.authoritativeSha,
    lastVerifiedSha: decision.lastVerifiedSha,
    state: decision.state,
    reason: decision.reason,
    missingWitnessIds: [...decision.missingWitnessIds].sort(),
    summary: `${decision.repo} ${decision.state}: ${decision.reason}`,
    promotionBlocked: decision.state !== 'VERIFIED',
    evaluatedAt: decision.evaluatedAt,
    correlationId: decision.correlationId,
  });
}

export function evaluateMainEvidenceV0(input: EvaluateMainEvidenceInputV0): EvaluateMainEvidenceOutputV0 {
  const nowMs = validTime(input.now);
  if (nowMs === null) throw new Error('ULTRATHINK_VERIFICATION_INVALID: now must be RFC3339');

  const authority = input.sourceAuthority ?? null;
  const previous = input.previousDecision ?? null;
  const missingWitnessIds: string[] = [];

  let state: MainEvidenceStateV0 = 'VERIFIED';
  let reason: MainEvidenceReasonV0 = 'RECOVERY_COMPLETE';

  const requirementIds = input.policy.requiredWitnesses.map((requirement) => requirement.id);
  const uniqueRequirementIds = new Set(requirementIds);

  if (requirementIds.length !== uniqueRequirementIds.size || requirementIds.some((id) => !id.trim())) {
    state = 'BLOCKED';
    reason = 'INVALID_WITNESS_POLICY';
  } else if (!authority || authority.kind !== 'source-authority.v0' || authority.branch !== 'main' || !authority.repo || !authority.authoritativeSha || validTime(authority.observedAt) === null) {
    state = 'BLOCKED';
    reason = 'SOURCE_AUTHORITY_UNRESOLVED';
  } else if (authority.repo !== input.policy.repo) {
    state = 'BLOCKED';
    reason = 'SOURCE_AUTHORITY_UNRESOLVED';
  } else {
    const sorted = sortWitnesses(input.witnesses);
    for (const requirement of [...input.policy.requiredWitnesses].sort((a, b) => a.id.localeCompare(b.id))) {
      const matches = resultsFor(requirement, sorted);
      const result = matches.length === 1 ? matches[0] : undefined;
      if (matches.length === 0 || result?.state === 'MISSING') missingWitnessIds.push(requirement.id);
      const classification = classifyRequirement({
        requirement,
        result,
        duplicate: matches.length > 1,
        authority,
        policy: input.policy,
        nowMs,
      });
      if (classification && precedence[classification.state] > precedence[state]) {
        state = classification.state;
        reason = classification.reason;
      } else if (classification && precedence[classification.state] === precedence[state] && reason === 'RECOVERY_COMPLETE') {
        reason = classification.reason;
      }
    }

    if (state !== 'VERIFIED' && previous?.authoritativeSha && previous.authoritativeSha !== authority.authoritativeSha && state === 'STALE' && reason === 'WITNESS_SHA_MISMATCH') {
      reason = 'MAIN_SHA_CHANGED';
    }
  }

  const authoritativeSha = authority?.authoritativeSha;
  const lastVerifiedSha = state === 'VERIFIED'
    ? authoritativeSha
    : previous?.state === 'VERIFIED'
      ? previous.authoritativeSha
      : previous?.lastVerifiedSha;

  const decision: MainEvidenceDecisionV0 = Object.freeze({
    kind: 'main-evidence-decision.v0',
    repo: input.policy.repo,
    branch: 'main',
    authoritativeSha,
    lastVerifiedSha,
    state,
    reason,
    policyHash: input.policy.policyHash,
    missingWitnessIds: Object.freeze([...missingWitnessIds].sort()),
    evaluatedAt: input.now,
    correlationId: input.correlationId,
  });

  const transition: ContinuityTransitionV0 = Object.freeze({
    kind: 'continuity-transition.v0',
    repo: decision.repo,
    fromState: previous?.state,
    toState: decision.state,
    fromAuthoritativeSha: previous?.authoritativeSha,
    toAuthoritativeSha: decision.authoritativeSha,
    reason: decision.reason,
    changedAt: decision.evaluatedAt,
    correlationId: input.correlationId,
  });

  return Object.freeze({ decision, transition, projection: projectionFor(decision) });
}
