import type {
  EvaluateParallelFixAuditInput,
  EvaluateStaleTruthDeletionInput,
  ParallelFixAuditEvaluation,
  ParallelFixAuditFinding,
  ParallelFixAuditSnapshot,
  StaleTruthArtifact,
  StaleTruthDeletionEvaluation,
  StaleTruthDeletionFinding,
  SupersessionProofCookie,
} from './types.js';
import {
  DEFAULT_PR_AUDIT_FRESHNESS_MS,
  MAX_PR_AUDIT_FRESHNESS_MS,
} from './verification.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function normalizedSha(value: string | null): string | null {
  const sha = value?.trim().toLowerCase() ?? '';
  return FULL_SHA.test(sha) ? sha : null;
}

function normalizedDiffFingerprint(value: string | null): string | null {
  const fingerprint = value?.trim().toLowerCase() ?? '';
  return SHA256.test(fingerprint) ? fingerprint : null;
}

function normalizedRepository(value: string): string | null {
  const repository = value.trim().toLowerCase();
  return repository.length > 0 ? repository : null;
}

function normalizedText(value: string | null): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

function normalizedActorId(value: string): string | null {
  const actor = value.trim().toLowerCase();
  return actor.length > 0 ? actor : null;
}

function normalizedPrNumber(value: number | null): number | null {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value : null;
}

function prIdentityIsValid(value: number | null): boolean {
  return value === null || normalizedPrNumber(value) !== null;
}

function sortedUnique<T extends string>(findings: readonly T[]): T[] {
  return [...new Set(findings)].sort((a, b) => a.localeCompare(b));
}

function snapshotFingerprintIsValid(snapshot: ParallelFixAuditSnapshot): boolean {
  return Boolean(
    normalizedRepository(snapshot.repository)
    && normalizedText(snapshot.targetBranch)
    && normalizedSha(snapshot.baseSha)
    && normalizedSha(snapshot.headSha)
    && prIdentityIsValid(snapshot.prNumber)
    && normalizedDiffFingerprint(snapshot.diffFingerprint),
  );
}

function artifactRecordEqual(a: StaleTruthArtifact, b: StaleTruthArtifact): boolean {
  return a.artifactId === b.artifactId
    && a.artifactClass === b.artifactClass
    && normalizedDiffFingerprint(a.fingerprint) === normalizedDiffFingerprint(b.fingerprint);
}

function cookieRecordEqual(a: SupersessionProofCookie, b: SupersessionProofCookie): boolean {
  return normalizedDiffFingerprint(a.cookieId) === normalizedDiffFingerprint(b.cookieId)
    && a.state === b.state
    && normalizedRepository(a.repository) === normalizedRepository(b.repository)
    && normalizedText(a.targetBranch) === normalizedText(b.targetBranch)
    && normalizedSha(a.baseSha) === normalizedSha(b.baseSha)
    && normalizedSha(a.headSha) === normalizedSha(b.headSha)
    && normalizedPrNumber(a.prNumber) === normalizedPrNumber(b.prNumber)
    && normalizedDiffFingerprint(a.replacementDiffFingerprint) === normalizedDiffFingerprint(b.replacementDiffFingerprint)
    && normalizedDiffFingerprint(a.supersededArtifactFingerprint) === normalizedDiffFingerprint(b.supersededArtifactFingerprint)
    && a.observedAt === b.observedAt
    && normalizedActorId(a.actorId) === normalizedActorId(b.actorId)
    && a.actorIdentityState === b.actorIdentityState;
}

export function evaluateParallelFixAudit(
  input: EvaluateParallelFixAuditInput,
): ParallelFixAuditEvaluation {
  const findings: ParallelFixAuditFinding[] = [];
  const auditedAtMs = Date.parse(input.auditedAt);
  const requestedWindow = input.freshnessWindowMs ?? DEFAULT_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowValid = Number.isInteger(requestedWindow)
    && requestedWindow > 0
    && requestedWindow <= MAX_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowMs = freshnessWindowValid
    ? requestedWindow
    : DEFAULT_PR_AUDIT_FRESHNESS_MS;

  if (Number.isNaN(auditedAtMs)) findings.push('parallel_audit_invalid_audit_time');
  if (!freshnessWindowValid) findings.push('parallel_audit_invalid_freshness_window');

  const builderBaseSha = normalizedSha(input.builder.baseSha);
  const builderHeadSha = normalizedSha(input.builder.headSha);
  const auditorBaseSha = normalizedSha(input.auditor.baseSha);
  const auditorHeadSha = normalizedSha(input.auditor.headSha);
  const builderDiffFingerprint = normalizedDiffFingerprint(input.builder.diffFingerprint);
  const auditorDiffFingerprint = normalizedDiffFingerprint(input.auditor.diffFingerprint);
  const auditorRepository = normalizedRepository(input.auditor.repository);
  const auditorTargetBranch = normalizedText(input.auditor.targetBranch);
  const auditorPrNumber = normalizedPrNumber(input.auditor.prNumber);

  if (!snapshotFingerprintIsValid(input.builder) || !snapshotFingerprintIsValid(input.auditor)) {
    findings.push('parallel_audit_fingerprint_malformed');
  }

  const builderActor = normalizedActorId(input.builder.actorId);
  const auditorActor = normalizedActorId(input.auditor.actorId);
  if (input.builder.actorIdentityState !== 'verified' || input.auditor.actorIdentityState !== 'verified') {
    findings.push('parallel_audit_actor_identity_unverified');
  }
  if (!builderActor || !auditorActor || builderActor === auditorActor) {
    findings.push('parallel_audit_not_independent');
  }

  const builderObservedAtMs = input.builder.observedAt ? Date.parse(input.builder.observedAt) : Number.NaN;
  const auditorObservedAtMs = input.auditor.observedAt ? Date.parse(input.auditor.observedAt) : Number.NaN;
  const observationTimeUnknown = Number.isNaN(builderObservedAtMs)
    || Number.isNaN(auditorObservedAtMs)
    || (!Number.isNaN(auditedAtMs) && builderObservedAtMs > auditedAtMs)
    || (!Number.isNaN(auditedAtMs) && auditorObservedAtMs > auditedAtMs);

  if (observationTimeUnknown) {
    findings.push('parallel_audit_observation_time_unknown');
  } else {
    if (auditorObservedAtMs < builderObservedAtMs) {
      findings.push('parallel_audit_older_than_builder');
    }
    if (!Number.isNaN(auditedAtMs) && auditedAtMs - auditorObservedAtMs > freshnessWindowMs) {
      findings.push('parallel_audit_observation_stale');
    }
  }

  if (input.auditor.evidenceState === 'evidence_incomplete') {
    findings.push('parallel_audit_evidence_incomplete');
  }
  if (input.auditor.evidenceState === 'evidence_conflicted') {
    findings.push('parallel_audit_evidence_conflicted');
  }

  if (normalizedRepository(input.builder.repository) !== auditorRepository) {
    findings.push('parallel_audit_repository_mismatch');
  }
  if (normalizedText(input.builder.targetBranch) !== auditorTargetBranch) {
    findings.push('parallel_audit_target_mismatch');
  }
  if (normalizedPrNumber(input.builder.prNumber) !== auditorPrNumber) {
    findings.push('parallel_audit_pr_mismatch');
  }
  if (builderBaseSha !== auditorBaseSha) findings.push('parallel_audit_base_moved');
  if (builderHeadSha !== auditorHeadSha) findings.push('parallel_audit_head_moved');
  if (builderDiffFingerprint !== auditorDiffFingerprint) findings.push('parallel_audit_diff_moved');

  const normalizedFindings = sortedUnique(findings);
  const conflicted = normalizedFindings.some((finding) => (
    finding === 'parallel_audit_repository_mismatch'
    || finding === 'parallel_audit_target_mismatch'
    || finding === 'parallel_audit_pr_mismatch'
    || finding === 'parallel_audit_base_moved'
    || finding === 'parallel_audit_head_moved'
    || finding === 'parallel_audit_diff_moved'
    || finding === 'parallel_audit_evidence_conflicted'
  ));

  return {
    state: conflicted
      ? 'evidence_conflicted'
      : normalizedFindings.length === 0
        ? 'evidence_complete'
        : 'evidence_incomplete',
    currentRepository: auditorRepository,
    currentTargetBranch: auditorTargetBranch,
    currentBaseSha: auditorBaseSha,
    currentHeadSha: auditorHeadSha,
    currentPrNumber: input.auditor.prNumber === null ? null : auditorPrNumber,
    currentDiffFingerprint: auditorDiffFingerprint,
    dependentProof: normalizedFindings.length === 0 ? 'current' : 'stale',
    findings: normalizedFindings,
  };
}

export function evaluateStaleTruthDeletion(
  input: EvaluateStaleTruthDeletionInput,
): StaleTruthDeletionEvaluation {
  const findings: StaleTruthDeletionFinding[] = [];
  const auditedAtMs = Date.parse(input.auditedAt);
  const requestedWindow = input.freshnessWindowMs ?? DEFAULT_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowValid = Number.isInteger(requestedWindow)
    && requestedWindow > 0
    && requestedWindow <= MAX_PR_AUDIT_FRESHNESS_MS;
  const freshnessWindowMs = freshnessWindowValid
    ? requestedWindow
    : DEFAULT_PR_AUDIT_FRESHNESS_MS;

  if (Number.isNaN(auditedAtMs)) findings.push('stale_deletion_invalid_audit_time');
  if (!freshnessWindowValid) findings.push('stale_deletion_invalid_freshness_window');

  const currentRepository = normalizedRepository(input.current.repository);
  const currentTargetBranch = normalizedText(input.current.targetBranch);
  const currentBaseSha = normalizedSha(input.current.baseSha);
  const currentHeadSha = normalizedSha(input.current.headSha);
  const currentPrNumber = input.current.prNumber === null ? null : normalizedPrNumber(input.current.prNumber);
  const currentDiffFingerprint = normalizedDiffFingerprint(input.current.diffFingerprint);

  const trustedArtifact = input.trustedArtifactIndex.get(input.staleArtifact.artifactId) ?? null;
  if (!trustedArtifact) findings.push('stale_deletion_artifact_not_trusted');
  if (trustedArtifact && !artifactRecordEqual(input.staleArtifact, trustedArtifact)) {
    findings.push('stale_deletion_artifact_integrity_mismatch');
  }
  const artifact = trustedArtifact ?? input.staleArtifact;
  const staleArtifactFingerprint = normalizedDiffFingerprint(artifact.fingerprint);

  const requestedCookieId = normalizedDiffFingerprint(input.proofCookie.cookieId);
  if (!requestedCookieId) findings.push('stale_deletion_cookie_id_malformed');
  const trustedCookie = requestedCookieId
    ? input.trustedProofCookieIndex.get(requestedCookieId) ?? null
    : null;
  if (!trustedCookie) findings.push('stale_deletion_cookie_not_trusted');
  if (trustedCookie && !cookieRecordEqual(input.proofCookie, trustedCookie)) {
    findings.push('stale_deletion_cookie_integrity_mismatch');
  }
  const cookie = trustedCookie ?? input.proofCookie;
  const proofCookieId = normalizedDiffFingerprint(cookie.cookieId);
  const cookieBaseSha = normalizedSha(cookie.baseSha);
  const cookieHeadSha = normalizedSha(cookie.headSha);
  const cookieDiffFingerprint = normalizedDiffFingerprint(cookie.replacementDiffFingerprint);
  const cookieSupersededFingerprint = normalizedDiffFingerprint(cookie.supersededArtifactFingerprint);

  if (
    input.parallelAudit.state !== 'evidence_complete'
    || input.parallelAudit.dependentProof !== 'current'
    || input.parallelAudit.currentBaseSha !== currentBaseSha
    || input.parallelAudit.currentHeadSha !== currentHeadSha
  ) {
    findings.push('stale_deletion_parallel_truth_not_current');
  }
  if (
    input.parallelAudit.currentRepository !== currentRepository
    || input.parallelAudit.currentTargetBranch !== currentTargetBranch
    || input.parallelAudit.currentPrNumber !== currentPrNumber
    || input.parallelAudit.currentDiffFingerprint !== currentDiffFingerprint
  ) {
    findings.push('stale_deletion_parallel_identity_mismatch');
  }

  if (!snapshotFingerprintIsValid(input.current)) {
    findings.push('stale_deletion_current_snapshot_malformed');
  }
  if (input.current.evidenceState !== 'evidence_complete') {
    findings.push('stale_deletion_current_evidence_not_complete');
  }
  if (input.current.actorIdentityState !== 'verified') {
    findings.push('stale_deletion_current_actor_unverified');
  }

  if (artifact.artifactClass !== 'derived_truth_artifact') {
    findings.push('stale_deletion_artifact_not_deletable');
  }
  if (!staleArtifactFingerprint) {
    findings.push('stale_deletion_artifact_fingerprint_malformed');
  }

  const proofCookieIdentityValid = Boolean(
    normalizedRepository(cookie.repository)
    && normalizedText(cookie.targetBranch)
    && cookieBaseSha
    && cookieHeadSha
    && prIdentityIsValid(cookie.prNumber)
    && cookieDiffFingerprint
    && cookieSupersededFingerprint,
  );
  if (!proofCookieIdentityValid) findings.push('stale_deletion_cookie_identity_malformed');
  if (cookie.state !== 'proven') findings.push('stale_deletion_cookie_not_proven');
  if (cookie.actorIdentityState !== 'verified') {
    findings.push('stale_deletion_cookie_actor_unverified');
  }

  const currentActor = normalizedActorId(input.current.actorId);
  const cookieActor = normalizedActorId(cookie.actorId);
  if (!currentActor || !cookieActor || currentActor !== cookieActor) {
    findings.push('stale_deletion_cookie_actor_mismatch');
  }

  if (normalizedRepository(cookie.repository) !== currentRepository) {
    findings.push('stale_deletion_cookie_repository_mismatch');
  }
  if (normalizedText(cookie.targetBranch) !== currentTargetBranch) {
    findings.push('stale_deletion_cookie_target_mismatch');
  }
  if ((cookie.prNumber === null ? null : normalizedPrNumber(cookie.prNumber)) !== currentPrNumber) {
    findings.push('stale_deletion_cookie_pr_mismatch');
  }
  if (cookieBaseSha !== currentBaseSha) findings.push('stale_deletion_cookie_base_mismatch');
  if (cookieHeadSha !== currentHeadSha) findings.push('stale_deletion_cookie_head_mismatch');
  if (cookieDiffFingerprint !== currentDiffFingerprint) findings.push('stale_deletion_cookie_diff_mismatch');
  if (cookieSupersededFingerprint !== staleArtifactFingerprint) {
    findings.push('stale_deletion_cookie_supersession_mismatch');
  }

  if (staleArtifactFingerprint && currentDiffFingerprint && staleArtifactFingerprint === currentDiffFingerprint) {
    findings.push('stale_deletion_current_truth_targeted');
  }

  const currentObservedAtMs = input.current.observedAt ? Date.parse(input.current.observedAt) : Number.NaN;
  const cookieObservedAtMs = cookie.observedAt ? Date.parse(cookie.observedAt) : Number.NaN;
  const currentTimeUnknown = Number.isNaN(currentObservedAtMs)
    || (!Number.isNaN(auditedAtMs) && currentObservedAtMs > auditedAtMs);
  const cookieTimeUnknown = Number.isNaN(cookieObservedAtMs)
    || (!Number.isNaN(auditedAtMs) && cookieObservedAtMs > auditedAtMs);

  if (currentTimeUnknown) {
    findings.push('stale_deletion_current_observation_time_unknown');
  } else if (!Number.isNaN(auditedAtMs) && auditedAtMs - currentObservedAtMs > freshnessWindowMs) {
    findings.push('stale_deletion_current_observation_stale');
  }

  if (cookieTimeUnknown) {
    findings.push('stale_deletion_cookie_observation_time_unknown');
  } else {
    if (!currentTimeUnknown && cookieObservedAtMs < currentObservedAtMs) {
      findings.push('stale_deletion_cookie_older_than_current');
    }
    if (!Number.isNaN(auditedAtMs) && auditedAtMs - cookieObservedAtMs > freshnessWindowMs) {
      findings.push('stale_deletion_cookie_observation_stale');
    }
  }

  const normalizedFindings = sortedUnique(findings);
  const conflicted = normalizedFindings.some((finding) => (
    finding === 'stale_deletion_parallel_truth_not_current'
    || finding === 'stale_deletion_parallel_identity_mismatch'
    || finding === 'stale_deletion_artifact_integrity_mismatch'
    || finding === 'stale_deletion_cookie_integrity_mismatch'
    || finding === 'stale_deletion_cookie_repository_mismatch'
    || finding === 'stale_deletion_cookie_target_mismatch'
    || finding === 'stale_deletion_cookie_pr_mismatch'
    || finding === 'stale_deletion_cookie_base_mismatch'
    || finding === 'stale_deletion_cookie_head_mismatch'
    || finding === 'stale_deletion_cookie_diff_mismatch'
    || finding === 'stale_deletion_cookie_supersession_mismatch'
    || finding === 'stale_deletion_current_truth_targeted'
  ));

  return {
    state: conflicted
      ? 'evidence_conflicted'
      : normalizedFindings.length === 0
        ? 'evidence_complete'
        : 'evidence_incomplete',
    deletionAuthority: normalizedFindings.length === 0 ? 'authorized' : 'denied',
    staleArtifactFingerprint,
    replacementHeadSha: currentHeadSha,
    replacementDiffFingerprint: currentDiffFingerprint,
    proofCookieId,
    findings: normalizedFindings,
  };
}
