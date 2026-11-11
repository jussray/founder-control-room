import { createHash } from 'node:crypto';

export const GOVERNED_EXECUTION_V1_SCHEMA = 'fcr/governed-execution-workflow@v1' as const;
export const JUSS_CANONICALIZATION = 'juss-c14n/1' as const;

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export type ApprovalIntegrityMode =
  | 'authoritative_store'
  | 'signed'
  | 'authoritative_store_and_signed';

export type ApprovalIntegrity = {
  integrityMode: ApprovalIntegrityMode;
  authoritativeRecordId?: string;
  authoritativeStore?: 'fcr_supabase';
  signerKeyId?: string;
  signature?: string;
  signatureAlgorithm?: string;
  approvalSubjectHash: string;
  policyVersion: string;
  authoritySnapshotId: string;
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
};

export type GovernedActionSpec = {
  schema: typeof GOVERNED_EXECUTION_V1_SCHEMA;
  executionId: string;
  actionKind: 'deploy_pinned_revision';
  repository: string;
  revision: string;
  target: {
    provider: string;
    environment: 'staging';
    name: string;
  };
  capabilityScope: readonly string[];
};

export type GovernedExecutionEnvelope = {
  actionSpec: GovernedActionSpec;
  actionSpecHash: string;
  planHash: string;
  policyVersion: string;
  authoritySnapshotId: string;
  idempotencyKey: string;
  approval: ApprovalIntegrity;
};

export type AuthorityReread = {
  approvalFound: boolean;
  executionId: string;
  actionSpecHash: string;
  planHash: string;
  policyVersion: string;
  authoritySnapshotId: string;
  capabilityScope: readonly string[];
  targetEnvironment: 'staging' | 'production' | 'unknown';
  integrity: ApprovalIntegrity;
};

export type AuthorityRereadDecision =
  | { disposition: 'PERMIT'; reasons: readonly [] }
  | { disposition: 'BLOCKED'; reasons: readonly string[] };

export type ProviderExecutionReceipt = {
  executionId: string;
  idempotencyKey: string;
  status: 'succeeded' | 'failed' | 'partial' | 'unknown';
  providerReference?: string;
  observedAt: string;
};

export type ProviderReconciliation = {
  executionId: string;
  idempotencyKey: string;
  result: 'succeeded' | 'failed' | 'unknown';
  providerReference?: string;
  observedAt: string;
};

export type EvidenceReference = {
  evidenceId: string;
  evidenceType: string;
  r2Bucket?: string;
  r2ObjectKey?: string;
  objectVersion?: string;
  contentHash: string;
  capturedAt: string;
};

export type VerificationReceipt = {
  executionId: string;
  idempotencyKey: string;
  verdict: 'verified_success' | 'verified_failure' | 'blocked' | 'unknown';
  assertionSetHash: string;
  evidenceManifestHash: string;
  evidence: readonly EvidenceReference[];
  observedAt: string;
};

export type GovernedExecutionTerminalState =
  | 'VERIFIED_SUCCESS'
  | 'VERIFIED_FAILURE'
  | 'BLOCKED'
  | 'ESCALATED';

export type GovernedExecutionLiveState =
  | GovernedExecutionTerminalState
  | 'UNKNOWN'
  | 'RECONCILING';

const SHA256 = /^[0-9a-f]{64}$/i;
const RFC3339_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSha256(value: string | undefined): boolean {
  return Boolean(value && SHA256.test(value));
}

function validTime(value: string | undefined): boolean {
  return Boolean(value && RFC3339_MILLIS.test(value) && Number.isFinite(Date.parse(value)));
}

function normalizeCanonical(value: unknown, path = '$'): CanonicalJson {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number.`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error(`${path} contains an unsafe integer; encode it as a decimal string.`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeCanonical(entry, `${path}[${index}]`));
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must be a plain JSON object.`);
    }

    const source = value as Record<string, unknown>;
    const target: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) throw new Error(`${path}.${key} is undefined; use null or omit before hashing.`);
      target[key] = normalizeCanonical(entry, `${path}.${key}`);
    }
    return target;
  }

  throw new Error(`${path} contains a value that is not valid canonical JSON.`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function hashBound<T>(payload: T): { canonicalization: typeof JUSS_CANONICALIZATION; payload: T; sha256: string } {
  return {
    canonicalization: JUSS_CANONICALIZATION,
    payload,
    sha256: sha256Canonical(payload),
  };
}

export function fingerprintActionSpec(actionSpec: GovernedActionSpec): string {
  return sha256Canonical(actionSpec);
}

function approvalIntegrityReasons(integrity: ApprovalIntegrity): string[] {
  const reasons: string[] = [];
  const needsStore = integrity.integrityMode !== 'signed';
  const needsSignature = integrity.integrityMode !== 'authoritative_store';

  if (!validSha256(integrity.approvalSubjectHash)) reasons.push('approval_subject_hash_invalid');
  if (!nonEmpty(integrity.policyVersion)) reasons.push('approval_policy_version_missing');
  if (!nonEmpty(integrity.authoritySnapshotId)) reasons.push('approval_authority_snapshot_missing');
  if (!validTime(integrity.issuedAt)) reasons.push('approval_issued_at_invalid');
  if (integrity.expiresAt && !validTime(integrity.expiresAt)) reasons.push('approval_expires_at_invalid');
  if (integrity.revokedAt && !validTime(integrity.revokedAt)) reasons.push('approval_revoked_at_invalid');

  if (needsStore) {
    if (integrity.authoritativeStore !== 'fcr_supabase') reasons.push('approval_authoritative_store_invalid');
    if (!nonEmpty(integrity.authoritativeRecordId)) reasons.push('approval_authoritative_record_missing');
  }

  if (needsSignature) {
    if (!nonEmpty(integrity.signerKeyId)) reasons.push('approval_signer_key_missing');
    if (!nonEmpty(integrity.signature)) reasons.push('approval_signature_missing');
    if (!nonEmpty(integrity.signatureAlgorithm)) reasons.push('approval_signature_algorithm_missing');
  }

  return reasons;
}

export function evaluateExecutionTimeAuthorityReread(
  envelope: GovernedExecutionEnvelope,
  reread: AuthorityReread,
  now = new Date(),
): AuthorityRereadDecision {
  const reasons = new Set<string>();
  const actionHash = fingerprintActionSpec(envelope.actionSpec);

  if (!reread.approvalFound) reasons.add('approval_missing');
  if (envelope.actionSpec.target.environment !== 'staging') reasons.add('action_target_not_staging');
  if (reread.targetEnvironment !== 'staging') reasons.add('reread_target_not_staging');
  if (actionHash !== envelope.actionSpecHash) reasons.add('action_spec_hash_invalid');
  if (reread.executionId !== envelope.actionSpec.executionId) reasons.add('execution_id_drift');
  if (reread.actionSpecHash !== envelope.actionSpecHash) reasons.add('action_spec_hash_drift');
  if (reread.planHash !== envelope.planHash) reasons.add('plan_hash_drift');
  if (reread.policyVersion !== envelope.policyVersion) reasons.add('policy_version_drift');
  if (reread.authoritySnapshotId !== envelope.authoritySnapshotId) reasons.add('authority_snapshot_drift');

  const requiredCapabilities = new Set(envelope.actionSpec.capabilityScope);
  const observedCapabilities = new Set(reread.capabilityScope);
  for (const capability of requiredCapabilities) {
    if (!observedCapabilities.has(capability)) reasons.add(`capability_scope_missing:${capability}`);
  }

  for (const reason of approvalIntegrityReasons(reread.integrity)) reasons.add(reason);

  if (reread.integrity.approvalSubjectHash !== envelope.actionSpecHash) {
    reasons.add('approval_subject_drift');
  }
  if (reread.integrity.policyVersion !== envelope.policyVersion) reasons.add('approval_policy_drift');
  if (reread.integrity.authoritySnapshotId !== envelope.authoritySnapshotId) {
    reasons.add('approval_authority_snapshot_drift');
  }

  if (reread.integrity.revokedAt) reasons.add('approval_revoked');
  if (reread.integrity.expiresAt && Date.parse(reread.integrity.expiresAt) <= now.getTime()) {
    reasons.add('approval_expired');
  }

  return reasons.size > 0
    ? { disposition: 'BLOCKED', reasons: [...reasons] }
    : { disposition: 'PERMIT', reasons: [] };
}

export function commandEnvelope(envelope: GovernedExecutionEnvelope) {
  return hashBound({
    executionId: envelope.actionSpec.executionId,
    idempotencyKey: envelope.idempotencyKey,
    actionSpecHash: envelope.actionSpecHash,
    planHash: envelope.planHash,
    authoritySnapshotId: envelope.authoritySnapshotId,
    policyVersion: envelope.policyVersion,
    capabilityScope: [...envelope.actionSpec.capabilityScope],
    target: envelope.actionSpec.target,
  });
}

export function requiresReconciliation(receipt: ProviderExecutionReceipt): boolean {
  return receipt.status === 'unknown';
}

export function providerMutationMayRetryFrom(state: GovernedExecutionLiveState): boolean {
  return state !== 'UNKNOWN' && state !== 'RECONCILING';
}

export function verifyReceiptBinding(
  envelope: GovernedExecutionEnvelope,
  verification: VerificationReceipt,
): GovernedExecutionTerminalState | 'UNKNOWN' {
  if (verification.executionId !== envelope.actionSpec.executionId) return 'BLOCKED';
  if (verification.idempotencyKey !== envelope.idempotencyKey) return 'BLOCKED';
  if (!validSha256(verification.assertionSetHash) || !validSha256(verification.evidenceManifestHash)) {
    return 'BLOCKED';
  }
  if (verification.evidence.some((item) => !validSha256(item.contentHash) || !validTime(item.capturedAt))) {
    return 'BLOCKED';
  }

  switch (verification.verdict) {
    case 'verified_success': return 'VERIFIED_SUCCESS';
    case 'verified_failure': return 'VERIFIED_FAILURE';
    case 'blocked': return 'BLOCKED';
    case 'unknown': return 'UNKNOWN';
  }
}
