import { createHash } from 'node:crypto';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TARGET_BRANCH = /^[A-Za-z0-9._/-]+$/;

export const RELEASE_PROOF_SCHEMA = 'fcr-release-proof-workflow@v0' as const;

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
};

export type ReleaseEvidenceObservation = {
  repository: string;
  headSha: string;
  candidateFingerprint: string;
  evidenceFingerprint: string;
  verdict: 'clear' | 'blocked';
};

export type FounderApprovalObservation = {
  repository: string;
  headSha: string;
  candidateFingerprint: string;
  authorityReceiptFingerprint: string;
  approved: boolean;
};

export type EvidenceDecision =
  | { state: 'EVIDENCE_CLEAR'; evidenceFingerprint: string }
  | { state: 'BLOCKED'; reason: 'EVIDENCE_IDENTITY_MISMATCH' | 'EVIDENCE_REPORTED_BLOCKER' | 'INVALID_EVIDENCE_OBSERVATION' };

export type FounderDecision =
  | { state: 'FOUNDER_APPROVAL_OBSERVED'; authorityReceiptFingerprint: string }
  | { state: 'HOLD'; reason: 'FOUNDER_IDENTITY_MISMATCH' | 'FOUNDER_APPROVAL_NOT_OBSERVED' | 'INVALID_FOUNDER_OBSERVATION' };

export type ReleaseProofReceipt = {
  schemaVersion: typeof RELEASE_PROOF_SCHEMA;
  state: 'READY_FOR_FINAL_REREAD';
  repository: string;
  targetBranch: string;
  baseSha: string;
  headSha: string;
  pullRequestNumber?: number;
  candidateFingerprint: string;
  evidenceFingerprint: string;
  authorityReceiptFingerprint: string;
  founderApprovalObserved: true;
  mergeAuthorized: false;
  deploymentAuthorized: false;
  providerMutationAuthorized: false;
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

export function bindReleaseProofCandidate(input: unknown): BoundReleaseProofCandidate {
  const candidate = normalizeReleaseProofCandidate(input);
  return {
    candidate,
    candidateFingerprint: fingerprintReleaseCandidate(candidate),
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
  if (!evidenceFingerprint || (source.verdict !== 'clear' && source.verdict !== 'blocked')) {
    return { state: 'BLOCKED', reason: 'INVALID_EVIDENCE_OBSERVATION' };
  }

  if (!sameCandidate(bound, source.repository, source.headSha, source.candidateFingerprint)) {
    return { state: 'BLOCKED', reason: 'EVIDENCE_IDENTITY_MISMATCH' };
  }

  if (source.verdict !== 'clear') {
    return { state: 'BLOCKED', reason: 'EVIDENCE_REPORTED_BLOCKER' };
  }

  return { state: 'EVIDENCE_CLEAR', evidenceFingerprint };
}

export function evaluateFounderApprovalObservation(
  bound: BoundReleaseProofCandidate,
  input: unknown,
): FounderDecision {
  const source = record(input);
  if (!source) return { state: 'HOLD', reason: 'INVALID_FOUNDER_OBSERVATION' };

  const authorityReceiptFingerprint = sha256(source.authorityReceiptFingerprint);
  if (!authorityReceiptFingerprint || typeof source.approved !== 'boolean') {
    return { state: 'HOLD', reason: 'INVALID_FOUNDER_OBSERVATION' };
  }

  if (!sameCandidate(bound, source.repository, source.headSha, source.candidateFingerprint)) {
    return { state: 'HOLD', reason: 'FOUNDER_IDENTITY_MISMATCH' };
  }

  if (!source.approved) {
    return { state: 'HOLD', reason: 'FOUNDER_APPROVAL_NOT_OBSERVED' };
  }

  return { state: 'FOUNDER_APPROVAL_OBSERVED', authorityReceiptFingerprint };
}

export function buildReleaseProofReceipt(
  bound: BoundReleaseProofCandidate,
  evidence: Extract<EvidenceDecision, { state: 'EVIDENCE_CLEAR' }>,
  founder: Extract<FounderDecision, { state: 'FOUNDER_APPROVAL_OBSERVED' }>,
): ReleaseProofReceipt {
  return {
    schemaVersion: RELEASE_PROOF_SCHEMA,
    state: 'READY_FOR_FINAL_REREAD',
    ...bound.candidate,
    candidateFingerprint: bound.candidateFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    authorityReceiptFingerprint: founder.authorityReceiptFingerprint,
    founderApprovalObserved: true,
    mergeAuthorized: false,
    deploymentAuthorized: false,
    providerMutationAuthorized: false,
    nextGate: 'FINAL_PROVIDER_REREAD_AND_EXISTING_AUTHORITY_CONTRACT_REQUIRED',
  };
}
