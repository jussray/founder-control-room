import { describe, expect, it } from 'vitest';

import {
  GOVERNED_EXECUTION_SCHEMA,
  type GovernedExecutionLease,
  type GovernedExecutionReceipt,
  type GovernedExecutionWitness,
  type GovernedExecutionWorld,
} from '../ultrathink-core/governedExecution.js';
import {
  bindGovernedExecutionReceipt,
  evaluateGovernedExecutionWorkflowCompletion,
  evaluateGovernedExecutionWorkflowPermit,
  type GovernedExecutionWorkflowInput,
} from './governedExecutionWorkflowContract.js';

const lease: GovernedExecutionLease = {
  schema: GOVERNED_EXECUTION_SCHEMA,
  authority: {
    id: 'lease-1',
    subject: 'jussray/founder-control-room#governed-execution',
    consequence: 'execute',
    evidenceIds: ['decision-receipt-1'],
    issuedAt: '2026-10-01T18:00:00.000Z',
    expiresAt: '2026-10-02T18:00:00.000Z',
    binding: {
      repository: 'jussray/founder-control-room',
      actor: 'founder',
    },
  },
  principal: {
    actorId: 'founder',
    workspaceId: 'juss',
    projectId: 'founder-control-room',
  },
  subject: {
    locator: 'jussray/founder-control-room#governed-execution',
    expectedVersion: 'candidate-a',
    fingerprint: 'subject-a',
  },
  capabilities: ['write_external'],
  forbiddenCapabilities: ['delete_external'],
  runtime: {
    harnessId: 'fcr-worker',
    harnessVersion: 'v1',
    runtimeGenerationHash: 'runtime-a',
    providerId: 'github',
    pluginSetHash: 'plugins-a',
  },
  boundary: {
    missionId: 'mission-1',
    shellId: 'fcr-shell',
    credentialLane: 'project',
    credentialProjectId: 'founder-control-room',
    allowedProviderIds: ['github'],
    providerFallback: 'deny',
    network: {
      mode: 'allowlist',
      allowedHosts: ['api.github.com'],
      blockPrivateNetworks: true,
    },
    founderAuthorization: {
      decisionReceiptId: 'decision-receipt-1',
      approvedByActorId: 'founder',
    },
    humanFinalAuthorizationRequired: true,
  },
  authoritySnapshot: {
    capabilityManifestHash: 'cap-a',
    resourceManifestHash: 'resource-a',
    adapterRegistryHash: 'adapter-a',
  },
  execution: {
    idempotencyKey: 'idem-1',
    maxAttempts: 1,
  },
  reversibility: 'reversible',
};

function world(): GovernedExecutionWorld {
  return {
    authorityWorld: {
      repository: 'jussray/founder-control-room',
      actor: 'founder',
      now: '2026-10-01T19:00:00.000Z',
    },
    principal: { ...lease.principal },
    subject: {
      locator: lease.subject.locator,
      observedVersion: lease.subject.expectedVersion,
      fingerprint: lease.subject.fingerprint,
    },
    requestedCapabilities: ['write_external'],
    adapterCapabilities: ['write_external'],
    runtime: { ...lease.runtime },
    boundary: {
      missionId: lease.boundary.missionId,
      shellId: lease.boundary.shellId,
      credentialLane: lease.boundary.credentialLane,
      credentialProjectId: lease.boundary.credentialProjectId,
      requestedEgressHosts: ['api.github.com'],
      founderAuthorization: {
        ...lease.boundary.founderAuthorization,
        valid: true,
      },
      killSwitches: {
        global: false,
        provider: false,
        project: false,
        capability: false,
      },
    },
    authoritySnapshot: { ...lease.authoritySnapshot },
    attempt: 1,
    leaseConsumed: false,
    previousOutcome: 'none',
  };
}

const input: GovernedExecutionWorkflowInput = {
  lease,
  minimumWitnessStrength: 'W2',
};

const receipt: GovernedExecutionReceipt = {
  leaseId: lease.authority.id,
  idempotencyKey: lease.execution.idempotencyKey,
  status: 'succeeded',
  runtimeIdentity: 'fcr-worker@candidate-a',
  externalRefs: ['github:mutation-1'],
  observedAt: '2026-10-01T19:01:00.000Z',
};

function witness(strength: GovernedExecutionWitness['strength']): GovernedExecutionWitness {
  return {
    status: 'verified',
    strength,
    evidenceFingerprint: 'a'.repeat(64),
    observedAt: '2026-10-01T19:02:00.000Z',
    receiptBinding: {
      leaseId: receipt.leaseId,
      idempotencyKey: receipt.idempotencyKey,
      status: receipt.status,
      runtimeIdentity: receipt.runtimeIdentity,
      externalRefs: [...receipt.externalRefs],
      receiptObservedAt: receipt.observedAt,
    },
  };
}

describe('GovernedExecutionWorkflowV1 contract', () => {
  it('permits only when the existing governed execution membrane returns EXECUTE', () => {
    expect(evaluateGovernedExecutionWorkflowPermit(input, world())).toMatchObject({
      state: 'READY_FOR_ATTEMPT',
      leaseId: 'lease-1',
      idempotencyKey: 'idem-1',
      completionClaimAllowed: false,
      reasons: [],
    });
  });

  it('fails closed when founder authorization is not valid in broker-owned world state', () => {
    const denied = world();
    denied.boundary.founderAuthorization.valid = false;

    expect(evaluateGovernedExecutionWorkflowPermit(input, denied)).toMatchObject({
      state: 'BLOCKED',
      completionClaimAllowed: false,
      reasons: expect.arrayContaining(['founder_authorization_invalid']),
    });
  });

  it('rejects an execution receipt that is not bound to the exact lease and idempotency key', () => {
    expect(bindGovernedExecutionReceipt(input, {
      ...receipt,
      leaseId: 'lease-other',
      idempotencyKey: 'idem-other',
    })).toEqual({
      valid: false,
      reasons: ['receipt_lease_mismatch', 'receipt_idempotency_mismatch'],
    });
  });

  it('holds a successful execution when independent proof is below the required strength', () => {
    expect(evaluateGovernedExecutionWorkflowCompletion(input, receipt, witness('W1'))).toMatchObject({
      state: 'HOLD',
      outcomeDisposition: 'EXECUTED_UNVERIFIED',
      completionClaimAllowed: false,
      nextGate: 'REACQUIRE_INDEPENDENT_PROOF',
    });
  });

  it('allows a completion claim only for a successful receipt with exact independent proof', () => {
    expect(evaluateGovernedExecutionWorkflowCompletion(input, receipt, witness('W2'))).toMatchObject({
      state: 'VERIFIED_SUCCESS',
      receiptStatus: 'succeeded',
      outcomeDisposition: 'VERIFIED',
      completionClaimAllowed: true,
      nextGate: 'COMPLETE',
      reasons: [],
    });
  });

  it('blocks when independent evidence contradicts the exact receipt', () => {
    expect(evaluateGovernedExecutionWorkflowCompletion(input, receipt, {
      ...witness('W2'),
      status: 'contradicted',
    })).toMatchObject({
      state: 'BLOCKED',
      outcomeDisposition: 'CONTRADICTED',
      completionClaimAllowed: false,
      nextGate: 'INVESTIGATE_CONTRADICTED_EVIDENCE',
    });
  });
});
