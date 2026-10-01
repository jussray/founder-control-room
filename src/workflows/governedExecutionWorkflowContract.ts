import {
  evaluateGovernedExecution,
  evaluateGovernedExecutionOutcome,
  type GovernedExecutionLease,
  type GovernedExecutionReceipt,
  type GovernedExecutionWitness,
  type GovernedExecutionWorld,
  type GovernedOutcomeDisposition,
  type WitnessStrength,
} from '../ultrathink-core/governedExecution.js';

export const GOVERNED_EXECUTION_WORKFLOW_SCHEMA = 'fcr/governed-execution-workflow@v1' as const;
export const DEFAULT_GOVERNED_EXECUTION_WITNESS_STRENGTH: WitnessStrength = 'W2';

export interface GovernedExecutionWorkflowInput {
  lease: GovernedExecutionLease;
  minimumWitnessStrength?: WitnessStrength;
}

export type GovernedExecutionWorkflowPermitState =
  | 'BLOCKED'
  | 'RECONCILE'
  | 'READY_FOR_ATTEMPT';

export interface GovernedExecutionWorkflowPermit {
  schemaVersion: typeof GOVERNED_EXECUTION_WORKFLOW_SCHEMA;
  state: GovernedExecutionWorkflowPermitState;
  leaseId: string;
  idempotencyKey: string;
  reasons: readonly string[];
  completionClaimAllowed: false;
}

export interface GovernedExecutionReceiptBindingDecision {
  valid: boolean;
  reasons: readonly string[];
}

export type GovernedExecutionWorkflowCompletionState =
  | 'VERIFIED_SUCCESS'
  | 'HOLD'
  | 'BLOCKED';

export interface GovernedExecutionWorkflowCompletion {
  schemaVersion: typeof GOVERNED_EXECUTION_WORKFLOW_SCHEMA;
  state: GovernedExecutionWorkflowCompletionState;
  leaseId: string;
  idempotencyKey: string;
  receiptStatus: GovernedExecutionReceipt['status'];
  outcomeDisposition: GovernedOutcomeDisposition;
  completionClaimAllowed: boolean;
  nextGate:
    | 'COMPLETE'
    | 'REACQUIRE_INDEPENDENT_PROOF'
    | 'REPAIR_FAILED_EXECUTION'
    | 'REPAIR_PARTIAL_EXECUTION'
    | 'RECONCILE_UNKNOWN_EXECUTION'
    | 'INVESTIGATE_CONTRADICTED_EVIDENCE'
    | 'REPAIR_RECEIPT_BINDING';
  reasons: readonly string[];
}

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function evaluateGovernedExecutionWorkflowPermit(
  input: GovernedExecutionWorkflowInput,
  world: GovernedExecutionWorld,
): GovernedExecutionWorkflowPermit {
  const decision = evaluateGovernedExecution(input.lease, world);
  const state: GovernedExecutionWorkflowPermitState = decision.disposition === 'EXECUTE'
    ? 'READY_FOR_ATTEMPT'
    : decision.disposition === 'RECONCILE'
      ? 'RECONCILE'
      : 'BLOCKED';

  return {
    schemaVersion: GOVERNED_EXECUTION_WORKFLOW_SCHEMA,
    state,
    leaseId: input.lease.authority.id,
    idempotencyKey: input.lease.execution.idempotencyKey,
    reasons: decision.reasons,
    completionClaimAllowed: false,
  };
}

export function bindGovernedExecutionReceipt(
  input: GovernedExecutionWorkflowInput,
  receipt: GovernedExecutionReceipt,
): GovernedExecutionReceiptBindingDecision {
  const reasons: string[] = [];

  if (normalized(receipt.leaseId) !== normalized(input.lease.authority.id)) {
    reasons.push('receipt_lease_mismatch');
  }
  if (normalized(receipt.idempotencyKey) !== normalized(input.lease.execution.idempotencyKey)) {
    reasons.push('receipt_idempotency_mismatch');
  }
  if (!normalized(receipt.runtimeIdentity)) {
    reasons.push('receipt_runtime_identity_missing');
  }
  if (!Number.isFinite(Date.parse(receipt.observedAt))) {
    reasons.push('receipt_observed_at_invalid');
  }

  return { valid: reasons.length === 0, reasons };
}

export function evaluateGovernedExecutionWorkflowCompletion(
  input: GovernedExecutionWorkflowInput,
  receipt: GovernedExecutionReceipt,
  witness: GovernedExecutionWitness,
): GovernedExecutionWorkflowCompletion {
  const binding = bindGovernedExecutionReceipt(input, receipt);
  const base = {
    schemaVersion: GOVERNED_EXECUTION_WORKFLOW_SCHEMA,
    leaseId: input.lease.authority.id,
    idempotencyKey: input.lease.execution.idempotencyKey,
    receiptStatus: receipt.status,
  } as const;

  if (!binding.valid) {
    return {
      ...base,
      state: 'BLOCKED',
      outcomeDisposition: 'UNKNOWN',
      completionClaimAllowed: false,
      nextGate: 'REPAIR_RECEIPT_BINDING',
      reasons: binding.reasons,
    };
  }

  const minimumWitnessStrength = input.minimumWitnessStrength
    ?? DEFAULT_GOVERNED_EXECUTION_WITNESS_STRENGTH;
  const outcomeDisposition = evaluateGovernedExecutionOutcome(
    receipt,
    witness,
    minimumWitnessStrength,
  );

  if (outcomeDisposition === 'CONTRADICTED') {
    return {
      ...base,
      state: 'BLOCKED',
      outcomeDisposition,
      completionClaimAllowed: false,
      nextGate: 'INVESTIGATE_CONTRADICTED_EVIDENCE',
      reasons: ['independent_witness_contradicted_receipt'],
    };
  }

  if (receipt.status === 'failed') {
    return {
      ...base,
      state: 'HOLD',
      outcomeDisposition,
      completionClaimAllowed: false,
      nextGate: 'REPAIR_FAILED_EXECUTION',
      reasons: ['execution_receipt_failed'],
    };
  }

  if (receipt.status === 'partial') {
    return {
      ...base,
      state: 'HOLD',
      outcomeDisposition,
      completionClaimAllowed: false,
      nextGate: 'REPAIR_PARTIAL_EXECUTION',
      reasons: ['execution_receipt_partial'],
    };
  }

  if (receipt.status === 'unknown') {
    return {
      ...base,
      state: 'HOLD',
      outcomeDisposition,
      completionClaimAllowed: false,
      nextGate: 'RECONCILE_UNKNOWN_EXECUTION',
      reasons: ['execution_receipt_unknown'],
    };
  }

  if (outcomeDisposition !== 'VERIFIED') {
    return {
      ...base,
      state: 'HOLD',
      outcomeDisposition,
      completionClaimAllowed: false,
      nextGate: 'REACQUIRE_INDEPENDENT_PROOF',
      reasons: ['independent_verification_not_satisfied'],
    };
  }

  return {
    ...base,
    state: 'VERIFIED_SUCCESS',
    outcomeDisposition,
    completionClaimAllowed: true,
    nextGate: 'COMPLETE',
    reasons: [],
  };
}
