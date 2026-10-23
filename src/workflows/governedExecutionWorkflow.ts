import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';

import type {
  GovernedExecutionReceipt,
  GovernedExecutionWitness,
  GovernedExecutionWorld,
} from '../ultrathink-core/governedExecution.js';
import {
  GOVERNED_EXECUTION_WORKFLOW_SCHEMA,
  bindGovernedExecutionReceipt,
  evaluateGovernedExecutionWorkflowCompletion,
  evaluateGovernedExecutionWorkflowPermit,
  type GovernedExecutionWorkflowInput,
} from './governedExecutionWorkflowContract.js';

type GovernedExecutionWorkflowEnv = Record<string, unknown>;

/**
 * Durable carrier for FCR governed execution.
 *
 * Cloudflare Workflows persists the sequence and waits, but does not authenticate
 * founder authority, choose provider permissions, or perform provider mutations.
 * The broker-owned world snapshot is evaluated by FCR's execution membrane. A
 * separately authorized executor performs the effect and emits a receipt. A
 * separately acquired witness then proves or contradicts that exact receipt.
 *
 * waitForEvent is transport only. Event arrival never creates authority.
 */
export class GovernedExecutionWorkflowV1 extends WorkflowEntrypoint<
  GovernedExecutionWorkflowEnv,
  GovernedExecutionWorkflowInput
> {
  async run(event: WorkflowEvent<GovernedExecutionWorkflowInput>, step: WorkflowStep) {
    const declaration = await step.do('declare governed execution lease', async () => ({
      schemaVersion: GOVERNED_EXECUTION_WORKFLOW_SCHEMA,
      leaseId: event.payload.lease.authority.id,
      idempotencyKey: event.payload.lease.execution.idempotencyKey,
      completionClaimAllowed: false,
    }));

    const worldEvent = await step.waitForEvent<GovernedExecutionWorld>(
      'await broker-owned authority world snapshot',
      {
        type: 'governed_world_ready',
        timeout: '24 hours',
      },
    );

    const permit = await step.do('permit exact governed execution', async () =>
      evaluateGovernedExecutionWorkflowPermit(event.payload, worldEvent.payload));

    if (permit.state !== 'READY_FOR_ATTEMPT') {
      return { ...declaration, ...permit };
    }

    const receiptEvent = await step.waitForEvent<GovernedExecutionReceipt>(
      'await separately authorized execution receipt',
      {
        type: 'governed_execution_receipt',
        timeout: '24 hours',
      },
    );

    const receiptBinding = await step.do('record and bind execution receipt', async () =>
      bindGovernedExecutionReceipt(event.payload, receiptEvent.payload));

    if (!receiptBinding.valid) {
      return {
        ...declaration,
        state: 'BLOCKED' as const,
        receiptStatus: receiptEvent.payload.status,
        outcomeDisposition: 'UNKNOWN' as const,
        completionClaimAllowed: false,
        nextGate: 'REPAIR_RECEIPT_BINDING' as const,
        reasons: receiptBinding.reasons,
      };
    }

    const witnessEvent = await step.waitForEvent<GovernedExecutionWitness>(
      'await independent execution witness',
      {
        type: 'governed_execution_witness',
        timeout: '24 hours',
      },
    );

    return step.do('prove and decide governed execution outcome', async () =>
      evaluateGovernedExecutionWorkflowCompletion(
        event.payload,
        receiptEvent.payload,
        witnessEvent.payload,
      ));
  }
}
