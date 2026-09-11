import { createHash } from 'node:crypto';

export interface ApprovalBinding {
  approvalId: string;
  actorId: string;
  action: string;
  payloadHash: string;
  targetId: string;
  targetFingerprint: string;
  providerCapability: string;
  projectId: string;
  branch?: string;
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  expiration: string;
  rollbackReference: string;
  idempotencyKey: string;
  createdAt: string;
  status:
    | 'draft'
    | 'requested'
    | 'reserved'
    | 'approved_once'
    | 'executing'
    | 'executed'
    | 'rejected'
    | 'expired'
    | 'invalidated';
}

export interface ApprovalExecutionAttempt {
  actorId: string;
  action: string;
  payload: unknown;
  targetId: string;
  targetFingerprint: string;
  providerCapability: string;
  projectId: string;
  branch?: string;
  now: string;
}

export type ApprovalValidationResult =
  | { ok: true; payloadHash: string }
  | {
      ok: false;
      code:
        | 'approval_not_executable'
        | 'approval_expired'
        | 'approval_replay_state_missing'
        | 'approval_replay'
        | 'actor_mismatch'
        | 'action_mismatch'
        | 'payload_invalid'
        | 'payload_mismatch'
        | 'target_mismatch'
        | 'fingerprint_mismatch'
        | 'capability_mismatch'
        | 'project_mismatch'
        | 'branch_mismatch'
        | 'invalid_timestamp';
    };

type CanonicalJson = string | number | boolean | null | CanonicalJson[] | { [key: string]: CanonicalJson };

function canonicalize(value: unknown, path = '$'): CanonicalJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`approval payload contains a non-finite number at ${path}`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`approval payload must contain only plain JSON objects at ${path}`);
    }
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalize(object[key], `${path}.${key}`)]),
    );
  }
  throw new TypeError(`approval payload contains a non-JSON value at ${path}`);
}

export function normalizeApprovalPayload(payload: unknown): string {
  return JSON.stringify(canonicalize(payload));
}

export function hashApprovalPayload(payload: unknown): string {
  return createHash('sha256')
    .update(normalizeApprovalPayload(payload), 'utf8')
    .digest('hex');
}

/**
 * Generic exact-target approval contract.
 *
 * Existing privileged V10 middleware remains authoritative until a separately
 * reviewed migration explicitly adopts this generic binding. This helper must
 * not be used to widen an existing authority ceiling.
 *
 * Replay state is mandatory and must come from the authoritative consumption
 * carrier for the execution path. This helper only validates an observed
 * consumption snapshot; it does not atomically consume an approval and cannot
 * substitute for a separately reviewed atomic execution/consumption store.
 */
export function validateApprovalExecution(
  binding: ApprovalBinding,
  attempt: ApprovalExecutionAttempt,
  consumedIdempotencyKeys: ReadonlySet<string>,
): ApprovalValidationResult {
  if (!consumedIdempotencyKeys) {
    return { ok: false, code: 'approval_replay_state_missing' };
  }
  if (binding.status !== 'approved_once') {
    return { ok: false, code: 'approval_not_executable' };
  }

  const now = Date.parse(attempt.now);
  const expiration = Date.parse(binding.expiration);
  if (!Number.isFinite(now) || !Number.isFinite(expiration)) {
    return { ok: false, code: 'invalid_timestamp' };
  }
  if (expiration <= now) return { ok: false, code: 'approval_expired' };
  if (consumedIdempotencyKeys.has(binding.idempotencyKey)) {
    return { ok: false, code: 'approval_replay' };
  }

  if (binding.actorId !== attempt.actorId) return { ok: false, code: 'actor_mismatch' };
  if (binding.action !== attempt.action) return { ok: false, code: 'action_mismatch' };

  let payloadHash: string;
  try {
    payloadHash = hashApprovalPayload(attempt.payload);
  } catch {
    return { ok: false, code: 'payload_invalid' };
  }
  if (binding.payloadHash !== payloadHash) return { ok: false, code: 'payload_mismatch' };
  if (binding.targetId !== attempt.targetId) return { ok: false, code: 'target_mismatch' };
  if (binding.targetFingerprint !== attempt.targetFingerprint) {
    return { ok: false, code: 'fingerprint_mismatch' };
  }
  if (binding.providerCapability !== attempt.providerCapability) {
    return { ok: false, code: 'capability_mismatch' };
  }
  if (binding.projectId !== attempt.projectId) return { ok: false, code: 'project_mismatch' };
  if ((binding.branch ?? null) !== (attempt.branch ?? null)) {
    return { ok: false, code: 'branch_mismatch' };
  }

  return { ok: true, payloadHash };
}
