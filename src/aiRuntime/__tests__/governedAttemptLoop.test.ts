import { describe, expect, it, vi } from 'vitest';

import {
  GOVERNED_EXECUTION_SCHEMA,
  type GovernedExecutionLease,
  type GovernedExecutionReceipt,
  type GovernedExecutionWitness,
} from '../../ultrathink-core/governedExecution.js';
import {
  runGovernedReadOnlyAttempt,
  runtimeIdentityForLease,
  type BrokerWorld,
  type GovernedRuntimeAdapter,
} from '../governedAttemptLoop.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const HASH_E = 'e'.repeat(64);
const SHA = '1'.repeat(40);

function lease(overrides: Partial<GovernedExecutionLease> = {}): GovernedExecutionLease {
  const base: GovernedExecutionLease = {
    schema: GOVERNED_EXECUTION_SCHEMA,
    authority: {
      id: 'lease-read-1',
      subject: 'simulated.read_only_observation',
      consequence: 'execute',
      evidenceIds: ['evidence-1'],
      issuedAt: '2026-09-07T19:00:00.000Z',
      expiresAt: '2026-09-07T21:00:00.000Z',
      binding: {
        repository: 'jussray/founder-control-room',
        headSha: SHA,
        policyHash: HASH_A,
        actor: 'jussray',
      },
    },
    principal: {
      actorId: 'jussray',
      workspaceId: 'fcr',
      projectId: 'founder-control-room',
    },
    subject: {
      locator: 'simulated://observation/1',
      expectedVersion: SHA,
      fingerprint: HASH_B,
    },
    capabilities: ['provider.observation.read'],
    forbiddenCapabilities: ['*.write', 'process.spawn', 'provider.*.mutate'],
    runtime: {
      harnessId: 'openclaw-compatible',
      harnessVersion: 'v0',
      runtimeGenerationHash: HASH_C,
      providerId: 'simulated',
      modelId: 'none',
      pluginSetHash: HASH_D,
    },
    authoritySnapshot: {
      capabilityManifestHash: HASH_A,
      resourceManifestHash: HASH_B,
      adapterRegistryHash: HASH_E,
    },
    execution: {
      idempotencyKey: 'obs-1',
      maxAttempts: 1,
    },
    reversibility: 'reversible',
  };

  return { ...base, ...overrides };
}

function world(overrides: Partial<BrokerWorld> = {}): BrokerWorld {
  return {
    authorityWorld: {
      repository: 'jussray/founder-control-room',
      headSha: SHA,
      policyHash: HASH_A,
      actor: 'jussray',
      now: '2026-09-07T20:00:00.000Z',
    },
    principal: {
      actorId: 'jussray',
      workspaceId: 'fcr',
      projectId: 'founder-control-room',
    },
    subject: {
      locator: 'simulated://observation/1',
      observedVersion: SHA,
      fingerprint: HASH_B,
    },
    runtime: {
      harnessId: 'openclaw-compatible',
      harnessVersion: 'v0',
      runtimeGenerationHash: HASH_C,
      providerId: 'simulated',
      modelId: 'none',
      pluginSetHash: HASH_D,
    },
    authoritySnapshot: {
      capabilityManifestHash: HASH_A,
      resourceManifestHash: HASH_B,
      adapterRegistryHash: HASH_E,
    },
    attempt: 1,
    leaseConsumed: false,
    previousOutcome: 'none',
    ...overrides,
  };
}

function receipt(activeLease: GovernedExecutionLease): GovernedExecutionReceipt {
  return {
    leaseId: activeLease.authority.id,
    idempotencyKey: activeLease.execution.idempotencyKey,
    status: 'succeeded',
    runtimeIdentity: runtimeIdentityForLease(activeLease),
    externalRefs: ['simulated:observation:1'],
    observedAt: '2026-09-07T20:00:01.000Z',
  };
}

function witness(activeReceipt: GovernedExecutionReceipt): GovernedExecutionWitness {
  return {
    status: 'verified',
    strength: 'W1',
    evidenceFingerprint: HASH_E,
    observedAt: '2026-09-07T20:00:02.000Z',
    receiptBinding: {
      leaseId: activeReceipt.leaseId,
      idempotencyKey: activeReceipt.idempotencyKey,
      status: activeReceipt.status,
      runtimeIdentity: activeReceipt.runtimeIdentity,
      externalRefs: activeReceipt.externalRefs,
      receiptObservedAt: activeReceipt.observedAt,
    },
  };
}

function adapter(
  activeLease: GovernedExecutionLease,
  overrides: Partial<GovernedRuntimeAdapter> = {},
): GovernedRuntimeAdapter {
  return {
    name: 'simulated.read_only_observation',
    effect: 'read_only',
    capabilities: ['provider.observation.read'],
    invoke: vi.fn(async () => receipt(activeLease)),
    ...overrides,
  };
}

describe('runGovernedReadOnlyAttempt', () => {
  it('refuses to invoke an adapter when no FCR lease exists', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease);

    const result = await runGovernedReadOnlyAttempt({
      lease: null,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
    });

    expect(result.state).toBe('DENIED');
    expect(result.decision.reasons).toContain('missing_lease');
    expect(activeAdapter.invoke).not.toHaveBeenCalled();
  });

  it('blocks adapter substitution even when both tools look read-only', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease);

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: 'simulated.different_observation',
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
    });

    expect(result.state).toBe('DENIED');
    expect(result.decision.reasons).toEqual(['adapter_name_mismatch']);
    expect(activeAdapter.invoke).not.toHaveBeenCalled();
  });

  it('routes an unknown previous outcome to reconciliation without replay', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease);

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world({ previousOutcome: 'unknown' }),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
    });

    expect(result.state).toBe('RECONCILE_REQUIRED');
    expect(result.decision.reasons).toEqual(['previous_outcome_unknown']);
    expect(activeAdapter.invoke).not.toHaveBeenCalled();
  });

  it('blocks a nested adapter capability that exceeds the lease', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease, {
      capabilities: ['provider.observation.read', 'process.spawn'],
    });

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
    });

    expect(result.state).toBe('DENIED');
    expect(result.decision.reasons).toContain('forbidden_capability:process.spawn');
    expect(activeAdapter.invoke).not.toHaveBeenCalled();
  });

  it('refuses write-capable adapters before the FCR membrane can execute them', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease, {
      effect: 'idempotent_write',
    });

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
    });

    expect(result.state).toBe('DENIED');
    expect(result.decision.reasons).toEqual(['adapter_not_read_only']);
    expect(activeAdapter.invoke).not.toHaveBeenCalled();
  });

  it('keeps runtime success unverified when no independent witness exists', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease);

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
    });

    expect(result.state).toBe('EXECUTED_UNVERIFIED');
    expect(activeAdapter.invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects a runtime receipt that does not bind to the exact runtime lease', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease, {
      invoke: vi.fn(async () => ({
        ...receipt(activeLease),
        runtimeIdentity: 'substituted-runtime',
      })),
    });
    const witnessFn = vi.fn(async (value: GovernedExecutionReceipt) => witness(value));

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
      witness: witnessFn,
    });

    expect(result.state).toBe('RECEIPT_REJECTED');
    expect(activeAdapter.invoke).toHaveBeenCalledTimes(1);
    expect(witnessFn).not.toHaveBeenCalled();
  });

  it('rejects a runtime receipt observed before the lease was issued', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease, {
      invoke: vi.fn(async () => ({
        ...receipt(activeLease),
        observedAt: '2026-09-07T18:59:59.999Z',
      })),
    });
    const witnessFn = vi.fn(async (value: GovernedExecutionReceipt) => witness(value));

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
      witness: witnessFn,
    });

    expect(result.state).toBe('RECEIPT_REJECTED');
    expect(result.reason).toContain('lease observation window');
    expect(witnessFn).not.toHaveBeenCalled();
  });

  it('rejects a runtime receipt observed at or after lease expiry', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease, {
      invoke: vi.fn(async () => ({
        ...receipt(activeLease),
        observedAt: activeLease.authority.expiresAt!,
      })),
    });
    const witnessFn = vi.fn(async (value: GovernedExecutionReceipt) => witness(value));

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
      witness: witnessFn,
    });

    expect(result.state).toBe('RECEIPT_REJECTED');
    expect(result.reason).toContain('lease observation window');
    expect(witnessFn).not.toHaveBeenCalled();
  });

  it('promotes only a lease-bound read-only receipt with a sufficient independent witness', async () => {
    const activeLease = lease();
    const activeAdapter = adapter(activeLease);
    const witnessFn = vi.fn(async (value: GovernedExecutionReceipt) => witness(value));

    const result = await runGovernedReadOnlyAttempt({
      lease: activeLease,
      world: world(),
      proposal: {
        toolName: activeAdapter.name,
        requestedCapabilities: ['provider.observation.read'],
      },
      adapter: activeAdapter,
      witness: witnessFn,
      minimumWitnessStrength: 'W1',
    });

    expect(result.state).toBe('VERIFIED');
    expect(result.decision).toEqual({ disposition: 'EXECUTE', reasons: [] });
    expect(activeAdapter.invoke).toHaveBeenCalledTimes(1);
    expect(witnessFn).toHaveBeenCalledTimes(1);
  });
});
