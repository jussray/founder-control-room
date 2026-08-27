export type UltrathinkActionKind = 'merge';

export type UltrathinkEvidenceState = 'pass' | 'fail' | 'not_evaluated';

export interface UltrathinkEvidenceRef {
  id: string;
  gateId: string;
  state: UltrathinkEvidenceState;
  observedAt: string;
  expiresAt?: string | null;
}

export interface UltrathinkAuthorityLease {
  approvedBy: string;
  approvedAt?: string | null;
  expiresAt: string;
  revision: number;
}

export interface UltrathinkActionIdentity {
  kind: UltrathinkActionKind;
  projectId: string;
  resourceId: string;
  target: string;
  candidate: string;
}

export interface UltrathinkActionContract {
  identity: UltrathinkActionIdentity;
  evidence: readonly UltrathinkEvidenceRef[];
  authority: UltrathinkAuthorityLease;
}

export type UltrathinkAuthorityStatus =
  | 'valid'
  | 'expired'
  | 'invalid_evidence'
  | 'malformed';

export interface UltrathinkAuthorityEvaluation {
  status: UltrathinkAuthorityStatus;
  reason: string;
}

export function evaluateAuthorityLease(
  contract: UltrathinkActionContract,
  nowMs = Date.now(),
): UltrathinkAuthorityEvaluation {
  if (
    !contract.identity.projectId
    || !contract.identity.resourceId
    || !contract.identity.target
    || !contract.identity.candidate
    || !contract.authority.approvedBy
    || !Number.isInteger(contract.authority.revision)
    || contract.authority.revision <= 0
  ) {
    return { status: 'malformed', reason: 'action identity or authority lease is malformed' };
  }

  const expiry = Date.parse(contract.authority.expiresAt);
  if (!Number.isFinite(expiry)) {
    return { status: 'malformed', reason: 'authority expiry is malformed' };
  }
  if (expiry <= nowMs) {
    return { status: 'expired', reason: 'authority lease expired' };
  }

  if (contract.evidence.length === 0 || contract.evidence.some((item) => item.state !== 'pass')) {
    return { status: 'invalid_evidence', reason: 'required evidence is not passing' };
  }

  return { status: 'valid', reason: 'authority lease and evidence are valid' };
}
