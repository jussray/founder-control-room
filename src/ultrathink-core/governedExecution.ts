import {
  evaluateAuthorityLease,
  type AuthorityLease,
  type AuthorityWorldState,
} from './authorityLease.js';

export const GOVERNED_EXECUTION_SCHEMA = 'fcr/governed-execution@v1' as const;

export type GovernedExecutionDisposition = 'EXECUTE' | 'DENY' | 'RECONCILE';
export type Reversibility = 'reversible' | 'compensatable' | 'irreversible';

export interface GovernedPrincipal {
  actorId: string;
  workspaceId: string;
  projectId?: string;
}

export interface GovernedSubject {
  locator: string;
  expectedVersion: string;
  fingerprint: string;
}

export interface GovernedRuntimeBinding {
  harnessId: string;
  harnessVersion: string;
  runtimeGenerationHash: string;
  providerId: string;
  modelId?: string;
  pluginSetHash: string;
}

export interface GovernedAuthoritySnapshot {
  capabilityManifestHash: string;
  resourceManifestHash: string;
  adapterRegistryHash: string;
}

export interface GovernedExecutionLease {
  schema: typeof GOVERNED_EXECUTION_SCHEMA;
  authority: AuthorityLease;
  principal: GovernedPrincipal;
  subject: GovernedSubject;
  capabilities: readonly string[];
  forbiddenCapabilities: readonly string[];
  runtime: GovernedRuntimeBinding;
  authoritySnapshot: GovernedAuthoritySnapshot;
  execution: {
    idempotencyKey: string;
    maxAttempts: number;
  };
  reversibility: Reversibility;
}

export interface GovernedExecutionWorld {
  authorityWorld: AuthorityWorldState;
  principal: GovernedPrincipal;
  subject: {
    locator: string;
    observedVersion: string;
    fingerprint: string;
  };
  requestedCapabilities: readonly string[];
  /**
   * Capabilities declared by the trusted adapter registry, including transitive
   * powers such as process spawning or provider mutation. This list is broker-owned,
   * not runtime-authored.
   */
  adapterCapabilities: readonly string[];
  runtime: GovernedRuntimeBinding;
  authoritySnapshot: GovernedAuthoritySnapshot;
  attempt: number;
  leaseConsumed: boolean;
  previousOutcome?: 'none' | 'known_success' | 'known_failure' | 'unknown';
}

export interface GovernedExecutionDecision {
  disposition: GovernedExecutionDisposition;
  reasons: readonly string[];
}

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function same(expected: string | undefined, actual: string | undefined): boolean {
  return normalized(expected) === normalized(actual);
}

function matchesCapabilityPattern(pattern: string, capability: string): boolean {
  const parts = pattern.split('*').map((part) =>
    part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  return new RegExp(`^${parts.join('.*')}$`).test(capability);
}

function isCovered(capability: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesCapabilityPattern(pattern, capability));
}

function addReason(reasons: Set<string>, reason: string): void {
  reasons.add(reason);
}

/**
 * FCR's execution membrane. The runtime may request work, but only the broker-owned
 * world state can prove that the exact authority, subject, runtime, resources, and
 * adapter capability graph still match the lease at use time.
 */
export function evaluateGovernedExecution(
  lease: GovernedExecutionLease | null | undefined,
  world: GovernedExecutionWorld,
): GovernedExecutionDecision {
  if (!lease) return { disposition: 'DENY', reasons: ['missing_lease'] };

  const reasons = new Set<string>();
  const authority = evaluateAuthorityLease(lease.authority, world.authorityWorld);

  for (const reason of authority.reasons) {
    addReason(reasons, `authority:${reason}`);
  }

  if (!same(lease.principal.actorId, world.principal.actorId)) {
    addReason(reasons, 'actor_drift');
  }
  if (!same(lease.principal.workspaceId, world.principal.workspaceId)) {
    addReason(reasons, 'workspace_drift');
  }
  if (!same(lease.principal.projectId, world.principal.projectId)) {
    addReason(reasons, 'project_drift');
  }

  if (!same(lease.subject.locator, world.subject.locator)) {
    addReason(reasons, 'subject_locator_drift');
  }
  if (!same(lease.subject.expectedVersion, world.subject.observedVersion)) {
    addReason(reasons, 'subject_version_drift');
  }
  if (!same(lease.subject.fingerprint, world.subject.fingerprint)) {
    addReason(reasons, 'subject_fingerprint_drift');
  }

  if (!same(lease.runtime.harnessId, world.runtime.harnessId)) {
    addReason(reasons, 'runtime_harness_drift');
  }
  if (!same(lease.runtime.harnessVersion, world.runtime.harnessVersion)) {
    addReason(reasons, 'runtime_harness_version_drift');
  }
  if (!same(lease.runtime.runtimeGenerationHash, world.runtime.runtimeGenerationHash)) {
    addReason(reasons, 'runtime_generation_drift');
  }
  if (!same(lease.runtime.providerId, world.runtime.providerId)) {
    addReason(reasons, 'runtime_provider_drift');
  }
  if (!same(lease.runtime.modelId, world.runtime.modelId)) {
    addReason(reasons, 'runtime_model_drift');
  }
  if (!same(lease.runtime.pluginSetHash, world.runtime.pluginSetHash)) {
    addReason(reasons, 'plugin_set_drift');
  }

  if (!same(
    lease.authoritySnapshot.capabilityManifestHash,
    world.authoritySnapshot.capabilityManifestHash,
  )) {
    addReason(reasons, 'capability_manifest_drift');
  }
  if (!same(
    lease.authoritySnapshot.resourceManifestHash,
    world.authoritySnapshot.resourceManifestHash,
  )) {
    addReason(reasons, 'resource_manifest_drift');
  }
  if (!same(
    lease.authoritySnapshot.adapterRegistryHash,
    world.authoritySnapshot.adapterRegistryHash,
  )) {
    addReason(reasons, 'adapter_registry_drift');
  }

  const effectiveCapabilities = new Set([
    ...world.requestedCapabilities,
    ...world.adapterCapabilities,
  ]);

  for (const capability of effectiveCapabilities) {
    if (isCovered(capability, lease.forbiddenCapabilities)) {
      addReason(reasons, `forbidden_capability:${capability}`);
      continue;
    }
    if (!isCovered(capability, lease.capabilities)) {
      addReason(reasons, `capability_not_leased:${capability}`);
    }
  }

  if (!normalized(lease.execution.idempotencyKey)) {
    addReason(reasons, 'invalid_idempotency_key');
  }
  if (!Number.isInteger(lease.execution.maxAttempts) || lease.execution.maxAttempts < 1) {
    addReason(reasons, 'invalid_max_attempts');
  }
  if (!Number.isInteger(world.attempt) || world.attempt < 1 || world.attempt > lease.execution.maxAttempts) {
    addReason(reasons, 'attempt_out_of_bounds');
  }
  if (world.leaseConsumed) {
    addReason(reasons, 'lease_replay');
  }
  if (world.previousOutcome === 'known_success') {
    addReason(reasons, 'previous_outcome_already_succeeded');
  }

  if (reasons.size > 0) {
    return { disposition: 'DENY', reasons: [...reasons] };
  }

  if (world.previousOutcome === 'unknown') {
    return { disposition: 'RECONCILE', reasons: ['previous_outcome_unknown'] };
  }

  return { disposition: 'EXECUTE', reasons: [] };
}

export type GovernedReceiptStatus = 'succeeded' | 'failed' | 'partial' | 'unknown';
export type WitnessStrength = 'W0' | 'W1' | 'W2' | 'W3' | 'W4';
export type GovernedOutcomeDisposition =
  | 'VERIFIED'
  | 'EXECUTED_UNVERIFIED'
  | 'FAILED'
  | 'PARTIAL'
  | 'UNKNOWN'
  | 'CONTRADICTED';

export interface GovernedExecutionReceipt {
  leaseId: string;
  idempotencyKey: string;
  status: GovernedReceiptStatus;
  runtimeIdentity: string;
  externalRefs: readonly string[];
  observedAt: string;
}

export interface GovernedReceiptBinding {
  leaseId: string;
  idempotencyKey: string;
  status: GovernedReceiptStatus;
  runtimeIdentity: string;
  externalRefs: readonly string[];
  receiptObservedAt: string;
}

export interface GovernedExecutionWitness {
  status: 'verified' | 'contradicted' | 'unknown';
  strength: WitnessStrength;
  evidenceFingerprint: string;
  observedAt: string;
  receiptBinding: GovernedReceiptBinding;
}

const WITNESS_STRENGTH: Record<WitnessStrength, number> = {
  W0: 0,
  W1: 1,
  W2: 2,
  W3: 3,
  W4: 4,
};

const SHA256_FINGERPRINT = /^[0-9a-f]{64}$/i;

function validEvidenceFingerprint(value: string | undefined): boolean {
  const fingerprint = normalized(value);
  return Boolean(fingerprint && SHA256_FINGERPRINT.test(fingerprint));
}

function sameRefs(expected: readonly string[], actual: readonly string[]): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((value, index) => same(value, actual[index]));
}

function witnessBindsReceipt(
  receipt: GovernedExecutionReceipt,
  witness: GovernedExecutionWitness,
): boolean {
  const receiptTime = Date.parse(receipt.observedAt);
  const witnessTime = Date.parse(witness.observedAt);

  return same(receipt.leaseId, witness.receiptBinding.leaseId)
    && same(receipt.idempotencyKey, witness.receiptBinding.idempotencyKey)
    && receipt.status === witness.receiptBinding.status
    && same(receipt.runtimeIdentity, witness.receiptBinding.runtimeIdentity)
    && sameRefs(receipt.externalRefs, witness.receiptBinding.externalRefs)
    && same(receipt.observedAt, witness.receiptBinding.receiptObservedAt)
    && Number.isFinite(receiptTime)
    && Number.isFinite(witnessTime)
    && witnessTime >= receiptTime;
}

/** Runtime success is execution evidence only. Verification requires a separately
 * supplied witness at or above the caller's required independence strength, bound
 * to the exact execution receipt it claims to verify or contradict, and carrying
 * an immutable SHA-256 evidence identity. */
export function evaluateGovernedExecutionOutcome(
  receipt: GovernedExecutionReceipt,
  witness?: GovernedExecutionWitness,
  minimumWitnessStrength: WitnessStrength = 'W1',
): GovernedOutcomeDisposition {
  const trustedWitness = witness
    && witnessBindsReceipt(receipt, witness)
    && validEvidenceFingerprint(witness.evidenceFingerprint)
    ? witness
    : undefined;

  if (trustedWitness?.status === 'contradicted') return 'CONTRADICTED';

  if (
    trustedWitness?.status === 'verified' &&
    WITNESS_STRENGTH[trustedWitness.strength] >= WITNESS_STRENGTH[minimumWitnessStrength]
  ) {
    return 'VERIFIED';
  }

  if (receipt.status === 'succeeded') return 'EXECUTED_UNVERIFIED';
  if (receipt.status === 'failed') return 'FAILED';
  if (receipt.status === 'partial') return 'PARTIAL';
  return 'UNKNOWN';
}
