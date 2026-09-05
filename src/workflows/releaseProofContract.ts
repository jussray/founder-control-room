import { createHash } from 'node:crypto';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TARGET_BRANCH = /^[A-Za-z0-9._/-]+$/;

export const RELEASE_PROOF_SCHEMA = 'fcr-release-proof-workflow@v0' as const;
export const RELEASE_PROOF_CONTINUITY_SCHEMA = 'fcr/release-proof-continuity@v1' as const;
export const ATTACK_1000_PRESSURE_BUDGET = 1000 as const;

export type ReleaseProofCandidate = {
  repository: string;
  targetBranch: string;
  baseSha: string;
  headSha: string;
  pullRequestNumber?: number;
};

export type BoundReleaseProofCandidate = {
  candidate: ReleaseProofCandidate;
  candidateFingerprint: string;
  candidateCookie: string;
};

export type ReleaseEvidenceObservation = {
  repository: string;
  headSha: string;
  candidateFingerprint: string;
  candidateCookie: string;
  evidenceFingerprint: string;
  verdict: 'clear' | 'blocked';
};

export type FounderApprovalObservation = {
  repository: string;
  headSha: string;
  candidateFingerprint: string;
  candidateCookie: string;
  evidenceFingerprint: string;
  evidenceCookie: string;
  authorityReceiptFingerprint: string;
  approved: boolean;
};

export type EvidenceDecision =
  | { state: 'EVIDENCE_CLEAR'; evidenceFingerprint: string; evidenceCookie: string }
  | {
    state: 'BLOCKED';
    reason:
      | 'EVIDENCE_IDENTITY_MISMATCH'
      | 'EVIDENCE_COOKIE_MISMATCH'
      | 'EVIDENCE_REPORTED_BLOCKER'
      | 'INVALID_EVIDENCE_OBSERVATION';
  };

export type FounderDecision =
  | { state: 'FOUNDER_APPROVAL_OBSERVED'; authorityReceiptFingerprint: string; authorityCookie: string }
  | {
    state: 'HOLD';
    reason:
      | 'FOUNDER_IDENTITY_MISMATCH'
      | 'FOUNDER_COOKIE_MISMATCH'
      | 'FOUNDER_EVIDENCE_MISMATCH'
      | 'FOUNDER_APPROVAL_NOT_OBSERVED'
      | 'INVALID_FOUNDER_OBSERVATION';
  };

export type ReleaseProofReceipt = {
  schemaVersion: typeof RELEASE_PROOF_SCHEMA;
  continuitySchema: typeof RELEASE_PROOF_CONTINUITY_SCHEMA;
  state: 'READY_FOR_FINAL_REREAD';
  repository: string;
  targetBranch: string;
  baseSha: string;
  headSha: string;
  pullRequestNumber?: number;
  candidateFingerprint: string;
  candidateCookie: string;
  evidenceFingerprint: string;
  evidenceCookie: string;
  authorityReceiptFingerprint: string;
  authorityCookie: string;
  founderApprovalObserved: true;
  mergeAuthorized: false;
  deploymentAuthorized: false;
  providerMutationAuthorized: false;
  attack1000: {
    pressureBudget: typeof ATTACK_1000_PRESSURE_BUDGET;
    literalExternalActionsClaimed: 0;
  };
  invariants: {
    historicalFingerprintIsImmutable: true;
    candidateMovementExpiresContinuity: true;
    evidenceCannotCrossCandidateCookie: true;
    authorityCannotCrossEvidenceCookie: true;
    receiptDoesNotSelfAuthorize: true;
  };
  nextGate: 'FINAL_PROVIDER_REREAD_AND_EXISTING_AUTHORITY_CONTRACT_REQUIRED';
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fullSha(value: unknown): string | null {
  const candidate = cleanString(value);
  return candidate && FULL_SHA.test(candidate) ? candidate.toLowerCase() : null;
}

function sha256(value: unknown): string | null {
  const candidate = cleanString(value);
  return candidate && SHA256.test(candidate) ? candidate.toLowerCase() : null;
}

function hashContinuity(label: string, ...parts: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify([RELEASE_PROOF_CONTINUITY_SCHEMA, label, ...parts]))
    .digest('hex');
}

export function normalizeReleaseProofCandidate(input: unknown): ReleaseProofCandidate {
  const source = record(input);
  if (!source) throw new Error('Release proof candidate must be an object.');

  const repository = cleanString(source.repository);
  if (!repository || repository.length > 200 || !REPOSITORY.test(repository)) {
    throw new Error('Release proof repository must be an owner/name identifier.');
  }

  const targetBranch = cleanString(source.targetBranch);
  if (!targetBranch || targetBranch.length > 255 || !TARGET_BRANCH.test(targetBranch)) {
    throw new Error('Release proof targetBranch is invalid.');
  }

  const baseSha = fullSha(source.baseSha);
  const headSha = fullSha(source.headSha);
  if (!baseSha || !headSha) {
    throw new Error('Release proof baseSha and headSha must be exact 40-character Git SHAs.');
  }

  let pullRequestNumber: number | undefined;
  if (source.pullRequestNumber !== undefined) {
    if (!Number.isInteger(source.pullRequestNumber) || Number(source.pullRequestNumber) <= 0) {
      throw new Error('Release proof pullRequestNumber must be a positive integer when supplied.');
    }
    pullRequestNumber = Number(source.pullRequestNumber);
  }

  return {
    repository,
    targetBranch,
    baseSha,
    headSha,
    ...(pullRequestNumber === undefined ? {} : { pullRequestNumber }),
  };
}

export function fingerprintReleaseCandidate(candidate: ReleaseProofCandidate): string {
  const canonical = JSON.stringify({
    repository: candidate.repository,
    targetBranch: candidate.targetBranch,
    baseSha: candidate.baseSha,
    headSha: candidate.headSha,
    pullRequestNumber: candidate.pullRequestNumber ?? null,
  });

  return createHash('sha256').update(canonical).digest('hex');
}

export function buildCandidateContinuityCookie(candidateFingerprint: string): string {
  const normalized = sha256(candidateFingerprint);
  if (!normalized) throw new Error('candidateFingerprint must be a SHA-256 fingerprint.');
  return hashContinuity('candidate-cookie', normalized);
}

export function buildEvidenceContinuityCookie(
  candidateCookie: string,
  evidenceFingerprint: string,
): string {
  const normalizedCandidateCookie = sha256(candidateCookie);
  const normalizedEvidenceFingerprint = sha256(evidenceFingerprint);
  if (!normalizedCandidateCookie || !normalizedEvidenceFingerprint) {
    throw new Error('Evidence continuity requires valid candidate and evidence fingerprints.');
  }
  return hashContinuity('evidence-cookie', normalizedCandidateCookie, normalizedEvidenceFingerprint);
}

export function buildAuthorityContinuityCookie(
  evidenceCookie: string,
  authorityReceiptFingerprint: string,
): string {
  const normalizedEvidenceCookie = sha256(evidenceCookie);
  const normalizedAuthorityFingerprint = sha256(authorityReceiptFingerprint);
  if (!normalizedEvidenceCookie || !normalizedAuthorityFingerprint) {
    throw new Error('Authority continuity requires valid evidence and authority fingerprints.');
  }
  return hashContinuity('authority-cookie', normalizedEvidenceCookie, normalizedAuthorityFingerprint);
}

export function bindReleaseProofCandidate(input: unknown): BoundReleaseProofCandidate {
  const candidate = normalizeReleaseProofCandidate(input);
  const candidateFingerprint = fingerprintReleaseCandidate(candidate);
  return {
    candidate,
    candidateFingerprint,
    candidateCookie: buildCandidateContinuityCookie(candidateFingerprint),
  };
}

function sameCandidate(
  bound: BoundReleaseProofCandidate,
  repository: unknown,
  headSha: unknown,
  candidateFingerprint: unknown,
): boolean {
  const normalizedHead = fullSha(headSha);
  const normalizedFingerprint = sha256(candidateFingerprint);
  return repository === bound.candidate.repository
    && normalizedHead === bound.candidate.headSha
    && normalizedFingerprint === bound.candidateFingerprint;
}

export function evaluateReleaseEvidence(
  bound: BoundReleaseProofCandidate,
  input: unknown,
): EvidenceDecision {
  const source = record(input);
  if (!source) return { state: 'BLOCKED', reason: 'INVALID_EVIDENCE_OBSERVATION' };

  const evidenceFingerprint = sha256(source.evidenceFingerprint);
  const candidateCookie = sha256(source.candidateCookie);
  if (!evidenceFingerprint || !candidateCookie || (source.verdict !== 'clear' && source.verdict !== 'blocked')) {
    return { state: 'BLOCKED', reason: 'INVALID_EVIDENCE_OBSERVATION' };
  }

  if (!sameCandidate(bound, source.repository, source.headSha, source.candidateFingerprint)) {
    return { state: 'BLOCKED', reason: 'EVIDENCE_IDENTITY_MISMATCH' };
  }

  if (candidateCookie !== bound.candidateCookie) {
    return { state: 'BLOCKED', reason: 'EVIDENCE_COOKIE_MISMATCH' };
  }

  if (source.verdict !== 'clear') {
    return { state: 'BLOCKED', reason: 'EVIDENCE_REPORTED_BLOCKER' };
  }

  return {
    state: 'EVIDENCE_CLEAR',
    evidenceFingerprint,
    evidenceCookie: buildEvidenceContinuityCookie(bound.candidateCookie, evidenceFingerprint),
  };
}

export function evaluateFounderApprovalObservation(
  bound: BoundReleaseProofCandidate,
  evidence: Extract<EvidenceDecision, { state: 'EVIDENCE_CLEAR' }>,
  input: unknown,
): FounderDecision {
  const source = record(input);
  if (!source) return { state: 'HOLD', reason: 'INVALID_FOUNDER_OBSERVATION' };

  const authorityReceiptFingerprint = sha256(source.authorityReceiptFingerprint);
  const candidateCookie = sha256(source.candidateCookie);
  const evidenceFingerprint = sha256(source.evidenceFingerprint);
  const evidenceCookie = sha256(source.evidenceCookie);
  if (
    !authorityReceiptFingerprint
    || !candidateCookie
    || !evidenceFingerprint
    || !evidenceCookie
    || typeof source.approved !== 'boolean'
  ) {
    return { state: 'HOLD', reason: 'INVALID_FOUNDER_OBSERVATION' };
  }

  if (!sameCandidate(bound, source.repository, source.headSha, source.candidateFingerprint)) {
    return { state: 'HOLD', reason: 'FOUNDER_IDENTITY_MISMATCH' };
  }

  if (candidateCookie !== bound.candidateCookie) {
    return { state: 'HOLD', reason: 'FOUNDER_COOKIE_MISMATCH' };
  }

  if (evidenceFingerprint !== evidence.evidenceFingerprint || evidenceCookie !== evidence.evidenceCookie) {
    return { state: 'HOLD', reason: 'FOUNDER_EVIDENCE_MISMATCH' };
  }

  if (!source.approved) {
    return { state: 'HOLD', reason: 'FOUNDER_APPROVAL_NOT_OBSERVED' };
  }

  return {
    state: 'FOUNDER_APPROVAL_OBSERVED',
    authorityReceiptFingerprint,
    authorityCookie: buildAuthorityContinuityCookie(evidence.evidenceCookie, authorityReceiptFingerprint),
  };
}

export function buildReleaseProofReceipt(
  bound: BoundReleaseProofCandidate,
  evidence: Extract<EvidenceDecision, { state: 'EVIDENCE_CLEAR' }>,
  founder: Extract<FounderDecision, { state: 'FOUNDER_APPROVAL_OBSERVED' }>,
): ReleaseProofReceipt {
  return {
    schemaVersion: RELEASE_PROOF_SCHEMA,
    continuitySchema: RELEASE_PROOF_CONTINUITY_SCHEMA,
    state: 'READY_FOR_FINAL_REREAD',
    ...bound.candidate,
    candidateFingerprint: bound.candidateFingerprint,
    candidateCookie: bound.candidateCookie,
    evidenceFingerprint: evidence.evidenceFingerprint,
    evidenceCookie: evidence.evidenceCookie,
    authorityReceiptFingerprint: founder.authorityReceiptFingerprint,
    authorityCookie: founder.authorityCookie,
    founderApprovalObserved: true,
    mergeAuthorized: false,
    deploymentAuthorized: false,
    providerMutationAuthorized: false,
    attack1000: {
      pressureBudget: ATTACK_1000_PRESSURE_BUDGET,
      literalExternalActionsClaimed: 0,
    },
    invariants: {
      historicalFingerprintIsImmutable: true,
      candidateMovementExpiresContinuity: true,
      evidenceCannotCrossCandidateCookie: true,
      authorityCannotCrossEvidenceCookie: true,
      receiptDoesNotSelfAuthorize: true,
    },
    nextGate: 'FINAL_PROVIDER_REREAD_AND_EXISTING_AUTHORITY_CONTRACT_REQUIRED',
  };
}
