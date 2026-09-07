import {
  evaluateGovernedExecution,
  evaluateGovernedExecutionOutcome,
  type GovernedExecutionDecision,
  type GovernedExecutionLease,
  type GovernedExecutionReceipt,
  type GovernedExecutionWitness,
  type GovernedExecutionWorld,
  type GovernedOutcomeDisposition,
  type WitnessStrength,
} from '../ultrathink-core/governedExecution.js';
import type { ToolEffect } from './toolFailover.js';

export type GovernedAttemptState =
  | GovernedOutcomeDisposition
  | 'DENIED'
  | 'RECONCILE_REQUIRED'
  | 'RECEIPT_REJECTED'
  | 'ATTEMPT_FAILED';

export interface GovernedAttemptProposal {
  toolName: string;
  requestedCapabilities: readonly string[];
}

export interface GovernedRuntimeAdapter {
  name: string;
  effect: ToolEffect;
  capabilities: readonly string[];
  invoke: () => Promise<GovernedExecutionReceipt>;
}

export type BrokerWorld = Omit<
  GovernedExecutionWorld,
  'requestedCapabilities' | 'adapterCapabilities'
>;

export interface GovernedAttemptInput {
  lease: GovernedExecutionLease | null | undefined;
  world: BrokerWorld;
  proposal: GovernedAttemptProposal;
  adapter: GovernedRuntimeAdapter;
  witness?: (
    receipt: GovernedExecutionReceipt,
  ) => Promise<GovernedExecutionWitness | undefined>;
  minimumWitnessStrength?: WitnessStrength;
}

export interface GovernedAttemptResult {
  state: GovernedAttemptState;
  decision: GovernedExecutionDecision;
  receipt?: GovernedExecutionReceipt;
  reason?: string;
}

export function runtimeIdentityForLease(lease: GovernedExecutionLease): string {
  const runtime = lease.runtime;
  return [
    runtime.harnessId,
    runtime.harnessVersion,
    runtime.runtimeGenerationHash,
    runtime.providerId,
    runtime.modelId ?? '',
    runtime.pluginSetHash,
  ].join('|');
}

function receiptMatchesLease(
  lease: GovernedExecutionLease,
  receipt: GovernedExecutionReceipt,
): boolean {
  return receipt.leaseId === lease.authority.id
    && receipt.idempotencyKey === lease.execution.idempotencyKey
    && receipt.runtimeIdentity === runtimeIdentityForLease(lease)
    && Number.isFinite(Date.parse(receipt.observedAt));
}

/**
 * First donor-runtime compatibility seam.
 *
 * The runtime may propose a read-only tool attempt, but FCR remains the broker:
 * it supplies the authoritative world state and adapter capability graph, evaluates
 * the lease immediately before execution, admits at most one adapter call, rejects
 * unbound receipts, and leaves verification to an independent witness.
 *
 * Write-capable adapters are intentionally excluded from this first spike.
 */
export async function runGovernedReadOnlyAttempt(
  input: GovernedAttemptInput,
): Promise<GovernedAttemptResult> {
  if (input.adapter.effect !== 'read_only') {
    return {
      state: 'DENIED',
      decision: { disposition: 'DENY', reasons: ['adapter_not_read_only'] },
      reason: 'The first donor-runtime seam admits read-only adapters only.',
    };
  }

  const executionWorld: GovernedExecutionWorld = {
    ...input.world,
    requestedCapabilities: input.proposal.requestedCapabilities,
    adapterCapabilities: input.adapter.capabilities,
  };
  const decision = evaluateGovernedExecution(input.lease, executionWorld);

  if (decision.disposition === 'DENY') {
    return { state: 'DENIED', decision };
  }
  if (decision.disposition === 'RECONCILE') {
    return { state: 'RECONCILE_REQUIRED', decision };
  }

  // EXECUTE can only be returned for a non-null lease.
  const lease = input.lease as GovernedExecutionLease;
  let receipt: GovernedExecutionReceipt;
  try {
    receipt = await input.adapter.invoke();
  } catch {
    return {
      state: 'ATTEMPT_FAILED',
      decision,
      reason: 'The adapter failed before producing a lease-bound execution receipt.',
    };
  }

  if (!receiptMatchesLease(lease, receipt)) {
    return {
      state: 'RECEIPT_REJECTED',
      decision,
      receipt,
      reason: 'The runtime receipt does not bind to the exact lease, idempotency key, runtime identity, and observation time.',
    };
  }

  const witness = input.witness ? await input.witness(receipt) : undefined;
  const outcome = evaluateGovernedExecutionOutcome(
    receipt,
    witness,
    input.minimumWitnessStrength ?? 'W1',
  );

  return {
    state: outcome,
    decision,
    receipt,
  };
}
