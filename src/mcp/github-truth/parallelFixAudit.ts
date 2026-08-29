import type {
  EvaluateParallelFixAuditInput,
  EvaluateStaleTruthDeletionInput,
  ParallelFixAuditEvaluation,
  ParallelFixAuditFinding,
  ParallelFixAuditSnapshot,
  StaleTruthDeletionEvaluation,
  StaleTruthDeletionFinding,
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

function normalizedRepository(value: string): string {
  return value.trim().toLowerCase();
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

  if (normalizedRepository(input.builder.repository) !== normalizedRepository(input.auditor.repository)) {
    findings.push('parallel_audit_repository_mismatch');
  }
  if (normalizedText(input.builder.targetBranch) !== normalizedText(input.auditor.targetBranch)) {
    findings.push('parallel_audit_target_mismatch');
  }
  if (normalizedPrNumber(input.builder.prNumber) !== normalizedPrNumber(input.auditor.prNumber)) {
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
    currentBaseSha: auditorBaseSha,
    currentHeadSha: auditorHeadSha,
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

  const currentBaseSha = normalizedSha(input.current.baseSha);
  const currentHeadSha = normalizedSha(input.current.headSha);
  const currentDiffFingerprint = normalizedDiffFingerprint(input.current.diffFingerprint);
  const staleArtifactFingerprint = normalizedDiffFingerprint(input.staleArtifact.fingerprint);
  const proofCookieId = normalizedDiffFingerprint(input.proofCookie.cookieId);
  const cookieBaseSha = normalizedSha(input.proofCookie.baseSha);
  const cookieHeadSha = normalizedSha(input.proofCookie.headSha);
  const cookieDiffFingerprint = normalizedDiffFingerprint(input.proofCookie.replacementDiffFingerprint);
  const cookieSupersededFingerprint = normalizedDiffFingerprint(input.proofCookie.supersededArtifactFingerprint);

  if (
    input.parallelAudit.state !== 'evidence_complete'
    || input.parallelAudit.dependentProof !== 'current'
    || input.parallelAudit.currentBaseSha !== currentBaseSha
    || input.parallelAudit.currentHeadSha !== currentHeadSha
  ) {
    findings.push('stale_deletion_parallel_truth_not_current');
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

  if (input.staleArtifact.artifactClass !== 'derived_truth_artifact') {
    findings.push('stale_deletion_artifact_not_deletable');
  }
  if (!staleArtifactFingerprint) {
    findings.push('stale_deletion_artifact_fingerprint_malformed');
  }

  if (!proofCookieId) findings.push('stale_deletion_cookie_id_malformed');
  const proofCookieIdentityValid = Boolean(
    normalizedRepository(input.proofCookie.repository)
    && normalizedText(input.proofCookie.targetBranch)
    && cookieBaseSha
    && cookieHeadSha
    && prIdentityIsValid(input.proofCookie.prNumber)
    && cookieDiffFingerprint
    && cookieSupersededFingerprint,
  );
  if (!proofCookieIdentityValid) findings.push('stale_deletion_cookie_identity_malformed');
  if (input.proofCookie.state !== 'proven') findings.push('stale_deletion_cookie_not_proven');
  if (input.proofCookie.actorIdentityState !== 'verified') {
    findings.push('stale_deletion_cookie_actor_unverified');
  }

  const currentActor = normalizedActorId(input.current.actorId);
  const cookieActor = normalizedActorId(input.proofCookie.actorId);
  if (!currentActor || !cookieActor || currentActor !== cookieActor) {
    findings.push('stale_deletion_cookie_actor_mismatch');
  }

  if (normalizedRepository(input.proofCookie.repository) !== normalizedRepository(input.current.repository)) {
    findings.push('stale_deletion_cookie_repository_mismatch');
  }
  if (normalizedText(input.proofCookie.targetBranch) !== normalizedText(input.current.targetBranch)) {
    findings.push('stale_deletion_cookie_target_mismatch');
  }
  if (normalizedPrNumber(input.proofCookie.prNumber) !== normalizedPrNumber(input.current.prNumber)) {
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
  const cookieObservedAtMs = input.proofCookie.observedAt
    ? Date.parse(input.proofCookie.observedAt)
    : Number.NaN;
  const observationTimeUnknown = Number.isNaN(currentObservedAtMs)
    || Number.isNaN(cookieObservedAtMs)
    || (!Number.isNaN(auditedAtMs) && currentObservedAtMs > auditedAtMs)
    || (!Number.isNaN(auditedAtMs) && cookieObservedAtMs > auditedAtMs);

  if (observationTimeUnknown) {
    findings.push('stale_deletion_cookie_observation_time_unknown');
  } else {
    if (cookieObservedAtMs < currentObservedAtMs) {
      findings.push('stale_deletion_cookie_older_than_current');
    }
    if (!Number.isNaN(auditedAtMs) && auditedAtMs - cookieObservedAtMs > freshnessWindowMs) {
      findings.push('stale_deletion_cookie_observation_stale');
    }
  }

  const normalizedFindings = sortedUnique(findings);
  const conflicted = normalizedFindings.some((finding) => (
    finding === 'stale_deletion_parallel_truth_not_current'
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
