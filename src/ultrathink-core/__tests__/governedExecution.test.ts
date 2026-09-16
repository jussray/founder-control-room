import { describe, expect, it } from 'vitest';

import {
  GOVERNED_EXECUTION_SCHEMA,
  evaluateGovernedExecution,
  evaluateGovernedExecutionOutcome,
  type GovernedExecutionLease,
  type GovernedExecutionReceipt,
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
    providerId: 'github',
    modelId: 'none',
    pluginSetHash: 'plugins-a',
  },
  boundary: {
    missionId: 'mission-read-only-1',
    shellId: 'shell-openclaw-spike',
    credentialLane: 'project',
    credentialProjectId: 'openclaw-spike',
    allowedProviderIds: ['github'],
    providerFallback: 'deny',
    network: {
      mode: 'allowlist',
      allowedHosts: ['api.github.com'],
      blockPrivateNetworks: true,
    },
    founderAuthorization: {
      decisionReceiptId: 'founder-decision-1',
      approvedByActorId: 'jussray',
    },
    humanFinalAuthorizationRequired: true,
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
    ...overrides,
  };
}

const receipt: GovernedExecutionReceipt = {
  leaseId: 'lease-1',
  idempotencyKey: lease.execution.idempotencyKey,
  status: 'succeeded',
  runtimeIdentity: 'openclaw-derived@spike-v1',
  externalRefs: ['simulated:observation:1'],
  observedAt: '2026-09-05T21:00:01.000Z',
};

const VERIFIED_EVIDENCE_FINGERPRINT = 'a'.repeat(64);
const CONTRADICTED_EVIDENCE_FINGERPRINT = 'b'.repeat(64);

function receiptBinding(overrides: Partial<{
  leaseId: string;
  idempotencyKey: string;
  status: GovernedExecutionReceipt['status'];
  runtimeIdentity: string;
  externalRefs: readonly string[];
  receiptObservedAt: string;
}> = {}) {
  return {
    leaseId: receipt.leaseId,
    idempotencyKey: receipt.idempotencyKey,
    status: receipt.status,
    runtimeIdentity: receipt.runtimeIdentity,
    externalRefs: receipt.externalRefs,
    receiptObservedAt: receipt.observedAt,
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

  it('10 denies contradictory state that reports an already successful outcome', () => {
    expect(evaluateGovernedExecution(lease, world({ previousOutcome: 'known_success' }))).toEqual({
      disposition: 'DENY',
      reasons: ['previous_outcome_already_succeeded'],
    });
  });

  it('11 reconciles an unknown prior outcome instead of retrying automatically', () => {
    expect(evaluateGovernedExecution(lease, world({ previousOutcome: 'unknown' }))).toEqual({
      disposition: 'RECONCILE',
      reasons: ['previous_outcome_unknown'],
    });
  });

  it('12 does not promote runtime success to verified truth without a witness', () => {
    expect(evaluateGovernedExecutionOutcome(receipt)).toBe('EXECUTED_UNVERIFIED');
  });

  it('13 refuses a verified witness bound to a different execution receipt', () => {
    expect(evaluateGovernedExecutionOutcome(
      receipt,
      {
        status: 'verified',
        strength: 'W4',
        evidenceFingerprint: VERIFIED_EVIDENCE_FINGERPRINT,
        observedAt: '2026-09-05T21:00:02.000Z',
        receiptBinding: receiptBinding({ idempotencyKey: 'different-operation' }),
      },
      'W2',
    )).toBe('EXECUTED_UNVERIFIED');
  });

  it('14 refuses a contradictory witness bound to a different execution receipt', () => {
    expect(evaluateGovernedExecutionOutcome(
      receipt,
      {
        status: 'contradicted',
        strength: 'W4',
        evidenceFingerprint: CONTRADICTED_EVIDENCE_FINGERPRINT,
        observedAt: '2026-09-05T21:00:02.000Z',
        receiptBinding: receiptBinding({ leaseId: 'lease-other' }),
      },
      'W2',
    )).toBe('EXECUTED_UNVERIFIED');
  });

  it('15 refuses a witness observed before the execution receipt', () => {
    expect(evaluateGovernedExecutionOutcome(
      receipt,
      {
        status: 'verified',
        strength: 'W4',
        evidenceFingerprint: VERIFIED_EVIDENCE_FINGERPRINT,
        observedAt: '2026-09-05T21:00:00.000Z',
        receiptBinding: receiptBinding(),
      },
      'W2',
    )).toBe('EXECUTED_UNVERIFIED');
  });

  it('16 refuses a witness bound to a different receipt status', () => {
    expect(evaluateGovernedExecutionOutcome(
      receipt,
      {
        status: 'verified',
        strength: 'W4',
        evidenceFingerprint: VERIFIED_EVIDENCE_FINGERPRINT,
        observedAt: '2026-09-05T21:00:02.000Z',
        receiptBinding: receiptBinding({ status: 'failed' }),
      },
      'W2',
    )).toBe('EXECUTED_UNVERIFIED');
  });

  it('17 refuses a verified witness with a malformed evidence fingerprint', () => {
    expect(evaluateGovernedExecutionOutcome(
      receipt,
      {
        status: 'verified',
        strength: 'W4',
        evidenceFingerprint: 'not-an-immutable-fingerprint',
        observedAt: '2026-09-05T21:00:02.000Z',
        receiptBinding: receiptBinding(),
      },
      'W2',
    )).toBe('EXECUTED_UNVERIFIED');
  });

  it('18 refuses a contradictory witness with a malformed evidence fingerprint', () => {
    expect(evaluateGovernedExecutionOutcome(
      receipt,
      {
        status: 'contradicted',
        strength: 'W4',
        evidenceFingerprint: '',
        observedAt: '2026-09-05T21:00:02.000Z',
        receiptBinding: receiptBinding(),
      },
      'W2',
    )).toBe('EXECUTED_UNVERIFIED');
  });

  it('19 executes the valid read-only lease and verifies only with a sufficient exact witness', () => {
    expect(evaluateGovernedExecution(lease, world())).toEqual({
      disposition: 'EXECUTE',
      reasons: [],
    });

    expect(evaluateGovernedExecutionOutcome(
      receipt,
      {
        status: 'verified',
        strength: 'W2',
        evidenceFingerprint: VERIFIED_EVIDENCE_FINGERPRINT,
        observedAt: '2026-09-05T21:00:02.000Z',
        receiptBinding: receiptBinding(),
      },
      'W2',
    )).toBe('VERIFIED');
  });

  it('20 denies project-shell escape even when the capability itself is leased', () => {
    expect(evaluateGovernedExecution(lease, world({
      boundary: { ...world().boundary, shellId: 'shell-other-project' },
    }))).toMatchObject({
      disposition: 'DENY',
      reasons: ['shell_drift'],
    });
  });

  it('21 denies silent provider fallback', () => {
    const result = evaluateGovernedExecution(lease, world({
      runtime: { ...lease.runtime, providerId: 'huggingface' },
    }));
    expect(result.disposition).toBe('DENY');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'runtime_provider_drift',
      'provider_not_leased:huggingface',
    ]));
  });

  it('22 denies a project credential lane that belongs to another project', () => {
    const result = evaluateGovernedExecution(lease, world({
      boundary: { ...world().boundary, credentialProjectId: 'another-project' },
    }));
    expect(result.disposition).toBe('DENY');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'credential_project_drift',
      'world_credential_project_mismatch',
    ]));
  });

  it('23 denies undeclared egress and private-network access', () => {
    const publicEscape = evaluateGovernedExecution(lease, world({
      boundary: { ...world().boundary, requestedEgressHosts: ['api.huggingface.co'] },
    }));
    expect(publicEscape).toMatchObject({
      disposition: 'DENY',
      reasons: ['egress_host_not_leased:api.huggingface.co'],
    });

    const privateEscape = evaluateGovernedExecution(lease, world({
      boundary: { ...world().boundary, requestedEgressHosts: ['127.0.0.1'] },
    }));
    expect(privateEscape.reasons).toEqual(expect.arrayContaining([
      'private_network_egress_denied:127.0.0.1',
    ]));
  });

  it('24 denies execution immediately when any kill switch is active', () => {
    for (const scope of ['global', 'provider', 'project', 'capability'] as const) {
      const result = evaluateGovernedExecution(lease, world({
        boundary: {
          ...world().boundary,
          killSwitches: { ...world().boundary.killSwitches, [scope]: true },
        },
      }));
      expect(result).toMatchObject({
        disposition: 'DENY',
        reasons: [`kill_switch:${scope}`],
      });
    }
  });

  it('25 denies missing or drifted human final authorization', () => {
    const invalid = evaluateGovernedExecution(lease, world({
      boundary: {
        ...world().boundary,
        founderAuthorization: {
          ...world().boundary.founderAuthorization,
          valid: false,
        },
      },
    }));
    expect(invalid).toMatchObject({
      disposition: 'DENY',
      reasons: ['founder_authorization_invalid'],
    });

    const drifted = evaluateGovernedExecution(lease, world({
      boundary: {
        ...world().boundary,
        founderAuthorization: {
          ...world().boundary.founderAuthorization,
          decisionReceiptId: 'founder-decision-other',
        },
      },
    }));
    expect(drifted).toMatchObject({
      disposition: 'DENY',
      reasons: ['founder_decision_receipt_drift'],
    });
  });

  it('26 supports a fully offline research shell with deny-all egress', () => {
    const offline = {
      ...lease,
      boundary: {
        ...lease.boundary,
        network: {
          ...lease.boundary.network,
          mode: 'deny-all' as const,
          allowedHosts: [],
        },
      },
    };
    const offlineWorld = world({
      boundary: { ...world().boundary, requestedEgressHosts: [] },
    });
    expect(evaluateGovernedExecution(offline, offlineWorld)).toEqual({
      disposition: 'EXECUTE',
      reasons: [],
    });
  });
});
