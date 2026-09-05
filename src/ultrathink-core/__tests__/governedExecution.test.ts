import { describe, expect, it } from 'vitest';

import {
  GOVERNED_EXECUTION_SCHEMA,
  evaluateGovernedExecution,
  evaluateGovernedExecutionOutcome,
  type GovernedExecutionLease,
  type GovernedExecutionWorld,
} from '../governedExecution.js';

const lease: GovernedExecutionLease = {
  schema: GOVERNED_EXECUTION_SCHEMA,
  authority: {
    id: 'lease-1',
    subject: 'openclaw-read-spike',
    consequence: 'observe',
    evidenceIds: ['proof-1'],
    issuedAt: '2026-09-05T20:00:00.000Z',
    expiresAt: '2026-09-05T22:00:00.000Z',
    binding: {
      repository: 'jussray/founder-control-room',
      headSha: 'head-a',
      policyHash: 'policy-a',
      actor: 'jussray',
    },
  },
  principal: {
    actorId: 'jussray',
    workspaceId: 'fcr',
    projectId: 'openclaw-spike',
  },
  subject: {
    locator: 'simulated.read_only_observation',
    expectedVersion: 'subject-v1',
    fingerprint: 'subject-fingerprint-a',
  },
  capabilities: ['network.read', 'provider.github.read'],
  forbiddenCapabilities: [
    'filesystem.write',
    'process.spawn',
    'network.mutate',
    'provider.*.mutate',
  ],
  runtime: {
    harnessId: 'openclaw-derived',
    harnessVersion: 'spike-v1',
    runtimeGenerationHash: 'runtime-generation-a',
    providerId: 'simulated',
    modelId: 'none',
    pluginSetHash: 'plugins-a',
  },
  authoritySnapshot: {
    capabilityManifestHash: 'capabilities-a',
    resourceManifestHash: 'resources-a',
    adapterRegistryHash: 'adapters-a',
  },
  execution: {
    idempotencyKey: 'openclaw-spike:subject-v1:read',
    maxAttempts: 1,
  },
  reversibility: 'reversible',
};

function world(overrides: Partial<GovernedExecutionWorld> = {}): GovernedExecutionWorld {
  return {
    authorityWorld: {
      repository: 'jussray/founder-control-room',
      headSha: 'head-a',
      policyHash: 'policy-a',
      actor: 'jussray',
      now: '2026-09-05T21:00:00.000Z',
    },
    principal: { ...lease.principal },
    subject: {
      locator: lease.subject.locator,
      observedVersion: lease.subject.expectedVersion,
      fingerprint: lease.subject.fingerprint,
    },
    requestedCapabilities: ['network.read'],
    adapterCapabilities: ['network.read'],
    runtime: { ...lease.runtime },
    authoritySnapshot: { ...lease.authoritySnapshot },
    attempt: 1,
    leaseConsumed: false,
    previousOutcome: 'none',
    ...overrides,
  };
}

describe('FCR governed execution membrane', () => {
  it('01 denies execution when no lease exists', () => {
    expect(evaluateGovernedExecution(null, world())).toEqual({
      disposition: 'DENY',
      reasons: ['missing_lease'],
    });
  });

  it('02 denies an expired authority lease', () => {
    const expired = {
      ...lease,
      authority: {
        ...lease.authority,
        expiresAt: '2026-09-05T20:30:00.000Z',
      },
    };

    expect(evaluateGovernedExecution(expired, world())).toMatchObject({
      disposition: 'DENY',
      reasons: ['authority:expired'],
    });
  });

  it('03 denies a stale subject version', () => {
    expect(evaluateGovernedExecution(lease, world({
      subject: {
        ...world().subject,
        observedVersion: 'subject-v2',
      },
    }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['subject_version_drift'],
    });
  });

  it('04 denies execution in the wrong workspace', () => {
    expect(evaluateGovernedExecution(lease, world({
      principal: { ...lease.principal, workspaceId: 'other-workspace' },
    }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['workspace_drift'],
    });
  });

  it('05 denies a capability that the founder lease never granted', () => {
    expect(evaluateGovernedExecution(lease, world({
      requestedCapabilities: ['provider.github.mutate'],
      adapterCapabilities: ['provider.github.mutate'],
    }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['forbidden_capability:provider.github.mutate'],
    });
  });

  it('06 denies transitive adapter escalation even when the runtime asks only for read', () => {
    expect(evaluateGovernedExecution(lease, world({
      requestedCapabilities: ['network.read'],
      adapterCapabilities: ['network.read', 'process.spawn'],
    }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['forbidden_capability:process.spawn'],
    });
  });

  it('07 denies resource manifest drift after authority evaluation', () => {
    expect(evaluateGovernedExecution(lease, world({
      authoritySnapshot: {
        ...lease.authoritySnapshot,
        resourceManifestHash: 'resources-b',
      },
    }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['resource_manifest_drift'],
    });
  });

  it('08 denies runtime generation substitution', () => {
    expect(evaluateGovernedExecution(lease, world({
      runtime: {
        ...lease.runtime,
        runtimeGenerationHash: 'runtime-generation-b',
      },
    }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['runtime_generation_drift'],
    });
  });

  it('09 denies replay of an already consumed lease', () => {
    expect(evaluateGovernedExecution(lease, world({ leaseConsumed: true }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['lease_replay'],
    });
  });

  it('10 reconciles an unknown prior outcome instead of retrying automatically', () => {
    expect(evaluateGovernedExecution(lease, world({ previousOutcome: 'unknown' }))).toEqual({
      disposition: 'RECONCILE',
      reasons: ['previous_outcome_unknown'],
    });
  });

  it('11 does not promote runtime success to verified truth without a witness', () => {
    expect(evaluateGovernedExecutionOutcome({
      leaseId: 'lease-1',
      idempotencyKey: lease.execution.idempotencyKey,
      status: 'succeeded',
      runtimeIdentity: 'openclaw-derived@spike-v1',
      externalRefs: ['simulated:observation:1'],
      observedAt: '2026-09-05T21:00:01.000Z',
    })).toBe('EXECUTED_UNVERIFIED');
  });

  it('12 executes the valid read-only lease and verifies only with a sufficient witness', () => {
    expect(evaluateGovernedExecution(lease, world())).toEqual({
      disposition: 'EXECUTE',
      reasons: [],
    });

    expect(evaluateGovernedExecutionOutcome(
      {
        leaseId: 'lease-1',
        idempotencyKey: lease.execution.idempotencyKey,
        status: 'succeeded',
        runtimeIdentity: 'openclaw-derived@spike-v1',
        externalRefs: ['simulated:observation:1'],
        observedAt: '2026-09-05T21:00:01.000Z',
      },
      {
        status: 'verified',
        strength: 'W2',
        evidenceFingerprint: 'witness-fingerprint-a',
        observedAt: '2026-09-05T21:00:02.000Z',
      },
      'W2',
    )).toBe('VERIFIED');
  });
});
