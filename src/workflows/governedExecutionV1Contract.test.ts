import { describe, expect, it } from 'vitest';

import {
  JUSS_CANONICALIZATION,
  canonicalJson,
  evaluateExecutionTimeAuthorityReread,
  fingerprintActionSpec,
  hashBound,
  requiresReconciliation,
  sha256Canonical,
  verifyReceiptBinding,
  type AuthorityReread,
  type GovernedActionSpec,
  type GovernedExecutionEnvelope,
  type ProviderExecutionReceipt,
  type VerificationReceipt,
} from './governedExecutionV1Contract.js';

const actionSpec: GovernedActionSpec = {
  schema: 'fcr/governed-execution-workflow@v1',
  executionId: 'exec-staging-001',
  actionKind: 'deploy_pinned_revision',
  repository: 'jussray/founder-control-room',
  revision: 'fb6e9074a9fe4436a9e256e21b43907f04e1cd37',
  target: {
    provider: 'cloudflare',
    environment: 'staging',
    name: 'founder-control-room-staging',
  },
  capabilityScope: ['deploy:staging:founder-control-room'],
};

function envelope(): GovernedExecutionEnvelope {
  const actionSpecHash = fingerprintActionSpec(actionSpec);
  return {
    actionSpec,
    actionSpecHash,
    planHash: sha256Canonical({ revision: actionSpec.revision, target: actionSpec.target }),
    policyVersion: 'fcr-policy-2026-10-01',
    authoritySnapshotId: 'authority-snapshot-001',
    idempotencyKey: 'deploy-staging-fb6e9074',
    approval: {
      integrityMode: 'authoritative_store',
      authoritativeRecordId: 'approval-001',
      authoritativeStore: 'fcr_supabase',
      approvalSubjectHash: actionSpecHash,
      policyVersion: 'fcr-policy-2026-10-01',
      authoritySnapshotId: 'authority-snapshot-001',
      issuedAt: '2026-10-01T16:00:00.000Z',
      expiresAt: '2026-10-01T18:00:00.000Z',
    },
  };
}

function reread(input = envelope()): AuthorityReread {
  return {
    approvalFound: true,
    executionId: input.actionSpec.executionId,
    actionSpecHash: input.actionSpecHash,
    planHash: input.planHash,
    policyVersion: input.policyVersion,
    authoritySnapshotId: input.authoritySnapshotId,
    capabilityScope: [...input.actionSpec.capabilityScope],
    targetEnvironment: 'staging',
    integrity: { ...input.approval },
  };
}

function verification(input = envelope()): VerificationReceipt {
  return {
    executionId: input.actionSpec.executionId,
    idempotencyKey: input.idempotencyKey,
    verdict: 'verified_success',
    assertionSetHash: sha256Canonical({ assertions: ['runtime revision matches', 'health endpoint green'] }),
    evidenceManifestHash: sha256Canonical({ evidence: ['runtime-readback'] }),
    evidence: [{
      evidenceId: 'runtime-readback',
      evidenceType: 'provider_runtime_readback',
      r2Bucket: 'fcr-governed-evidence',
      r2ObjectKey: 'exec-staging-001/runtime-readback.json',
      contentHash: sha256Canonical({ revision: actionSpec.revision, healthy: true }),
      capturedAt: '2026-10-01T16:05:00.000Z',
    }],
    observedAt: '2026-10-01T16:05:01.000Z',
  };
}

describe('GovernedExecutionWorkflowV1 contract', () => {
  it('canonicalizes object keys deterministically and binds the algorithm version', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(hashBound({ z: 1, a: 2 })).toMatchObject({
      canonicalization: JUSS_CANONICALIZATION,
      sha256: sha256Canonical({ a: 2, z: 1 }),
    });
  });

  it('rejects undefined and non-finite values before authority hashing', () => {
    expect(() => canonicalJson({ bad: undefined })).toThrow(/undefined/);
    expect(() => canonicalJson({ bad: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ bad: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });

  it('permits only an exact, current, staging-bound authoritative reread', () => {
    const input = envelope();
    expect(evaluateExecutionTimeAuthorityReread(
      input,
      reread(input),
      new Date('2026-10-01T17:00:00.000Z'),
    )).toEqual({ disposition: 'PERMIT', reasons: [] });
  });

  it('hard-blocks revoked, expired, production, or drifted approvals', () => {
    const input = envelope();
    const observed = reread(input);
    observed.targetEnvironment = 'production';
    observed.planHash = sha256Canonical({ different: true });
    observed.integrity = {
      ...observed.integrity,
      revokedAt: '2026-10-01T16:30:00.000Z',
      expiresAt: '2026-10-01T16:45:00.000Z',
    };

    const decision = evaluateExecutionTimeAuthorityReread(
      input,
      observed,
      new Date('2026-10-01T17:00:00.000Z'),
    );

    expect(decision.disposition).toBe('BLOCKED');
    if (decision.disposition === 'BLOCKED') {
      expect(decision.reasons).toEqual(expect.arrayContaining([
        'reread_target_not_staging',
        'plan_hash_drift',
        'approval_revoked',
        'approval_expired',
      ]));
    }
  });

  it('requires provider reconciliation for UNKNOWN instead of blind retry semantics', () => {
    const receipt: ProviderExecutionReceipt = {
      executionId: actionSpec.executionId,
      idempotencyKey: envelope().idempotencyKey,
      status: 'unknown',
      observedAt: '2026-10-01T16:04:00.000Z',
    };

    expect(requiresReconciliation(receipt)).toBe(true);
  });

  it('accepts a verification result only when it binds to the exact execution and evidence hashes are valid', () => {
    const input = envelope();
    expect(verifyReceiptBinding(input, verification(input))).toBe('VERIFIED_SUCCESS');

    expect(verifyReceiptBinding(input, {
      ...verification(input),
      idempotencyKey: 'wrong-command',
    })).toBe('BLOCKED');
  });
});
