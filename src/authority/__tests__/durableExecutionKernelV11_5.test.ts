import { describe, expect, it } from 'vitest';
import {
  PEP_AUDIENCE,
  assertStableIdempotencyKey,
  calculateReplayRetentionUntil,
  decideLeaseRecovery,
  validateExecutionEnvelopeBinding,
  validateLeaseFence,
  type CanonicalExecutionEnvelope,
  type ExecutionPermitEnvelopeBinding,
} from '../durableExecutionKernelV11_5.js';

const digestA = `sha256:${'a'.repeat(64)}` as const;
const digestB = `sha256:${'b'.repeat(64)}` as const;

const envelope: CanonicalExecutionEnvelope = Object.freeze({
  version: 1,
  actionKind: 'http',
  destination: 'https://api.example.test',
  operation: 'POST /v1/items',
  bodyDigest: digestA,
  argumentsDigest: null,
  resourceDigest: digestB,
  downstreamIdempotencyKey: 'logical-operation-1',
});

const permit: ExecutionPermitEnvelopeBinding = Object.freeze({
  permitId: 'permit-1',
  taskId: 'task-1',
  requestDigest: digestA,
  canonicalEnvelopeDigest: digestB,
  audience: PEP_AUDIENCE.http,
  actionKind: 'http',
  downstreamIdempotencyKey: 'logical-operation-1',
  authorityEpoch: 7,
  expiresAt: 10_000,
});

describe('durable execution kernel v11.5', () => {
  it('uses an exhaustive fixed audience map instead of string interpolation', () => {
    expect(PEP_AUDIENCE).toEqual({
      http: 'http-egress-pep',
      filesystem: 'filesystem-pep',
      secret: 'secret-broker',
      tool: 'tool-gateway',
      process: 'process-runner',
    });
  });

  it('fails closed if the immutable envelope digest changes before dispatch', () => {
    const result = validateExecutionEnvelopeBinding({
      permit,
      envelope,
      executorAudience: 'http-egress-pep',
      hasher: { digest: () => digestA },
      now: 5_000,
    });
    expect(result).toEqual({ ok: false, reason: 'ENVELOPE_DIGEST_MISMATCH' });
  });

  it('accepts only the exact audience, stable logical-operation key, and bound envelope digest', () => {
    const result = validateExecutionEnvelopeBinding({
      permit,
      envelope,
      executorAudience: 'http-egress-pep',
      hasher: { digest: () => digestB },
      now: 5_000,
    });
    expect(result).toEqual({ ok: true });
  });

  it('separates permit expiry from risk-tiered replay retention', () => {
    const expiry = 10_000;
    expect(calculateReplayRetentionUntil(expiry, 'LOW', 5_000)).toBe(expiry + 5 * 60_000);
    expect(calculateReplayRetentionUntil(expiry, 'HIGH', 5_000)).toBe(expiry + 30 * 24 * 60 * 60_000);
    expect(calculateReplayRetentionUntil(expiry, 'CRITICAL', 5_000)).toBe(expiry + 365 * 24 * 60 * 60_000);
  });

  it('never treats lease expiry alone as proof that destructive redispatch is safe', () => {
    expect(decideLeaseRecovery({ idempotencyMode: 'native', riskTier: 'CRITICAL' }))
      .toBe('REDISPATCH_SAME_IMMUTABLE_OPERATION');
    expect(decideLeaseRecovery({ idempotencyMode: 'reconcile', riskTier: 'HIGH' }))
      .toBe('RECONCILE_BEFORE_RETRY');
    expect(decideLeaseRecovery({ idempotencyMode: 'none', riskTier: 'HIGH' }))
      .toBe('REQUIRES_REVIEW');
  });

  it('fences zombie workers when a successor lease generation exists', () => {
    const claimed = { workerId: 'worker-a', leaseGeneration: 1, leaseExpiresAt: 9_000 };
    const current = { workerId: 'worker-b', leaseGeneration: 2, leaseExpiresAt: 20_000 };
    expect(validateLeaseFence({ claimed, current, now: 8_000 }))
      .toEqual({ ok: false, reason: 'LEASE_FENCED' });
  });

  it('rejects outcome writes after the current lease expires', () => {
    const lease = { workerId: 'worker-a', leaseGeneration: 3, leaseExpiresAt: 9_000 };
    expect(validateLeaseFence({ claimed: lease, current: lease, now: 9_001 }))
      .toEqual({ ok: false, reason: 'LEASE_EXPIRED' });
  });

  it('forbids idempotency-key rotation between immutable envelope and outbox operation', () => {
    expect(() => assertStableIdempotencyKey({
      operationKey: 'logical-operation-1',
      envelopeKey: 'logical-operation-2',
    })).toThrow('IDEMPOTENCY_KEY_ROTATION_OR_MISMATCH');
  });
});
