export const DURABLE_EXECUTION_KERNEL_V11_5_CONTRACT = 'fcr/durable-execution-kernel@v11.5' as const;

export type ExecutionRiskTier = 'LOW' | 'HIGH' | 'CRITICAL';
export type DestinationIdempotencyMode = 'native' | 'client-token' | 'reconcile' | 'none';
export type ExecutionActionKind = 'http' | 'filesystem' | 'secret' | 'tool' | 'process';

export type ExecutionAudience =
  | 'http-egress-pep'
  | 'filesystem-pep'
  | 'secret-broker'
  | 'tool-gateway'
  | 'process-runner';

export const PEP_AUDIENCE = Object.freeze({
  http: 'http-egress-pep',
  filesystem: 'filesystem-pep',
  secret: 'secret-broker',
  tool: 'tool-gateway',
  process: 'process-runner',
} as const satisfies Record<ExecutionActionKind, ExecutionAudience>);

export type CanonicalExecutionEnvelope = Readonly<{
  version: 1;
  actionKind: ExecutionActionKind;
  destination: string;
  operation: string;
  bodyDigest: `sha256:${string}` | null;
  argumentsDigest: `sha256:${string}` | null;
  resourceDigest: `sha256:${string}`;
  downstreamIdempotencyKey: string;
}>;

export type ExecutionPermitEnvelopeBinding = Readonly<{
  permitId: string;
  taskId: string;
  requestDigest: `sha256:${string}`;
  canonicalEnvelopeDigest: `sha256:${string}`;
  audience: ExecutionAudience;
  actionKind: ExecutionActionKind;
  downstreamIdempotencyKey: string;
  authorityEpoch: number;
  expiresAt: number;
}>;

/** Production callers must inject a conformance-tested RFC 8785/JCS hasher. */
export interface CanonicalEnvelopeHasher {
  digest(envelope: CanonicalExecutionEnvelope): `sha256:${string}`;
}

export type EnvelopeBindingValidation =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'PERMIT_EXPIRED'
        | 'AUDIENCE_MISMATCH'
        | 'IDEMPOTENCY_KEY_MISMATCH'
        | 'ENVELOPE_DIGEST_MISMATCH';
    };

export function validateExecutionEnvelopeBinding(input: {
  permit: ExecutionPermitEnvelopeBinding;
  envelope: CanonicalExecutionEnvelope;
  executorAudience: ExecutionAudience;
  hasher: CanonicalEnvelopeHasher;
  now?: number;
}): EnvelopeBindingValidation {
  const now = input.now ?? Date.now();
  if (now > input.permit.expiresAt) return { ok: false, reason: 'PERMIT_EXPIRED' };

  const expectedAudience = PEP_AUDIENCE[input.envelope.actionKind];
  if (
    input.permit.audience !== input.executorAudience
    || input.permit.audience !== expectedAudience
    || input.permit.actionKind !== input.envelope.actionKind
  ) {
    return { ok: false, reason: 'AUDIENCE_MISMATCH' };
  }

  if (input.permit.downstreamIdempotencyKey !== input.envelope.downstreamIdempotencyKey) {
    return { ok: false, reason: 'IDEMPOTENCY_KEY_MISMATCH' };
  }

  if (input.hasher.digest(input.envelope) !== input.permit.canonicalEnvelopeDigest) {
    return { ok: false, reason: 'ENVELOPE_DIGEST_MISMATCH' };
  }

  return { ok: true };
}

const RETENTION_MS: Readonly<Record<ExecutionRiskTier, number>> = Object.freeze({
  LOW: 5 * 60_000,
  HIGH: 30 * 24 * 60 * 60_000,
  CRITICAL: 365 * 24 * 60 * 60_000,
});

export function calculateReplayRetentionUntil(
  permitExpiresAt: number,
  riskTier: ExecutionRiskTier,
  now = Date.now(),
): number {
  return Math.max(permitExpiresAt, now) + RETENTION_MS[riskTier];
}

export type RecoveryDecision =
  | 'REDISPATCH_SAME_IMMUTABLE_OPERATION'
  | 'RECONCILE_BEFORE_RETRY'
  | 'REQUIRES_REVIEW';

export function decideLeaseRecovery(input: {
  idempotencyMode: DestinationIdempotencyMode;
  riskTier: ExecutionRiskTier;
}): RecoveryDecision {
  if (input.idempotencyMode === 'native' || input.idempotencyMode === 'client-token') {
    return 'REDISPATCH_SAME_IMMUTABLE_OPERATION';
  }
  if (input.idempotencyMode === 'reconcile') return 'RECONCILE_BEFORE_RETRY';
  return 'REQUIRES_REVIEW';
}

export type LeaseFence = Readonly<{
  workerId: string;
  leaseGeneration: number;
  leaseExpiresAt: number;
}>;

export function validateLeaseFence(input: {
  claimed: LeaseFence;
  current: LeaseFence;
  now?: number;
}): { ok: true } | { ok: false; reason: 'LEASE_FENCED' | 'LEASE_EXPIRED' } {
  const now = input.now ?? Date.now();
  if (
    input.claimed.workerId !== input.current.workerId
    || input.claimed.leaseGeneration !== input.current.leaseGeneration
  ) {
    return { ok: false, reason: 'LEASE_FENCED' };
  }
  if (input.current.leaseExpiresAt <= now) return { ok: false, reason: 'LEASE_EXPIRED' };
  return { ok: true };
}

/**
 * Stable downstream identity belongs to the logical operation, never a dispatch attempt.
 * A payload or destination change requires a new intent, permit, envelope digest, and key.
 */
export function assertStableIdempotencyKey(input: {
  operationKey: string;
  envelopeKey: string;
}): void {
  if (!input.operationKey || input.operationKey !== input.envelopeKey) {
    throw new Error('IDEMPOTENCY_KEY_ROTATION_OR_MISMATCH');
  }
}
