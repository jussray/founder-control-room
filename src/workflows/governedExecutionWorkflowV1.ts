import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

import {
  evaluateExecutionTimeAuthorityReread,
  requiresReconciliation,
  verifyReceiptBinding,
  type AuthorityReread,
  type GovernedExecutionEnvelope,
  type ProviderExecutionReceipt,
  type ProviderReconciliation,
  type VerificationReceipt,
} from './governedExecutionV1Contract.js';
import {
  indexEvidenceReference,
  recordProviderExecutionReceipt,
  recordProviderReconciliation,
  reserveGovernedCommand,
} from './governedExecutionJournal.js';

type GovernedExecutionWorkflowV1Env = {
  /** Local execution journal only. Never canonical governance truth. */
  GOVERNED_EXECUTION_JOURNAL: D1Database;
  /** Reserved binding for immutable-by-convention raw evidence artifacts. */
  GOVERNED_EXECUTION_EVIDENCE: R2Bucket;
};

/**
 * Staged durable coordinator for one governed execution.
 *
 * Important authority boundary:
 * - This class does not authenticate founder authority.
 * - This class does not call GitHub, Cloudflare Deploy, or any other mutation provider.
 * - This class does not create canonical Supabase/FCR governance receipts.
 * - D1 is only the local execution journal/idempotency/reconciliation projection.
 * - R2 is only an evidence artifact vault; evidence still requires Verification Core adjudication.
 *
 * Local D1 steps are intentionally safe to retry because their helpers are idempotent
 * and transactionally reserve/update the execution journal. Provider mutation is not
 * performed inside any retryable Workflow step. An UNKNOWN provider outcome must be
 * reconciled before another mutation can be considered.
 *
 * The external mutation executor must consume the D1 command claim only after the
 * canonical FCR/Supabase execution-time authority reread has been supplied. The
 * executor then sends a provider_execution_receipt event back to this instance.
 */
export class GovernedExecutionWorkflowV1 extends WorkflowEntrypoint<
  GovernedExecutionWorkflowV1Env,
  GovernedExecutionEnvelope
> {
  async run(event: WorkflowEvent<GovernedExecutionEnvelope>, step: WorkflowStep) {
    const envelope = event.payload;

    const authorityEvent = await step.waitForEvent<AuthorityReread>(
      'await canonical execution-time authority reread',
      {
        type: 'authority_reread',
        timeout: '24 hours',
      },
    );

    const authority = await step.do(
      'validate execution-time authority binding',
      async () => evaluateExecutionTimeAuthorityReread(envelope, authorityEvent.payload),
    );

    if (authority.disposition !== 'PERMIT') {
      return {
        state: 'BLOCKED' as const,
        reasons: authority.reasons,
        canonicalTruthEstablished: false,
        providerMutationAuthorizedByWorkflow: false,
        nextGate: 'REPAIR_OR_REACQUIRE_CANONICAL_AUTHORITY',
      };
    }

    const command = await step.do(
      'reserve idempotent D1 command claim',
      async () => reserveGovernedCommand(
        this.env.GOVERNED_EXECUTION_JOURNAL,
        envelope,
        event.instanceId,
      ),
    );

    const providerEvent = await step.waitForEvent<ProviderExecutionReceipt>(
      'await separately authorized provider execution receipt',
      {
        type: 'provider_execution_receipt',
        timeout: '24 hours',
      },
    );

    await step.do(
      'record provider execution claim in local journal',
      async () => recordProviderExecutionReceipt(
        this.env.GOVERNED_EXECUTION_JOURNAL,
        envelope,
        providerEvent.payload,
      ),
    );

    let providerStatus = providerEvent.payload.status;
    let providerReference = providerEvent.payload.providerReference;

    if (requiresReconciliation(providerEvent.payload)) {
      const reconciliationEvent = await step.waitForEvent<ProviderReconciliation>(
        'reconcile unknown provider outcome before any new mutation',
        {
          type: 'provider_reconciliation',
          timeout: '24 hours',
        },
      );

      await step.do(
        'record provider reconciliation result',
        async () => recordProviderReconciliation(
          this.env.GOVERNED_EXECUTION_JOURNAL,
          envelope,
          reconciliationEvent.payload,
        ),
      );

      providerStatus = reconciliationEvent.payload.result;
      providerReference = reconciliationEvent.payload.providerReference ?? providerReference;

      if (providerStatus === 'unknown') {
        return {
          state: 'ESCALATED' as const,
          reason: 'PROVIDER_OUTCOME_REMAINS_UNKNOWN',
          commandHash: command.commandHash,
          providerReference,
          canonicalTruthEstablished: false,
          providerMutationAuthorizedByWorkflow: false,
          nextGate: 'HUMAN_OR_PROVIDER_NATIVE_RECONCILIATION_REQUIRED',
        };
      }
    }

    const verificationEvent = await step.waitForEvent<VerificationReceipt>(
      'await Verification Core receipt and evidence manifest',
      {
        type: 'verification_receipt',
        timeout: '24 hours',
      },
    );

    await step.do(
      'index evidence references in D1 local projection',
      async () => {
        for (const evidence of verificationEvent.payload.evidence) {
          await indexEvidenceReference(
            this.env.GOVERNED_EXECUTION_JOURNAL,
            envelope,
            evidence,
          );
        }
      },
    );

    const verificationState = await step.do(
      'bind verification receipt to exact execution',
      async () => verifyReceiptBinding(envelope, verificationEvent.payload),
    );

    if (verificationState === 'UNKNOWN') {
      return {
        state: 'ESCALATED' as const,
        reason: 'VERIFICATION_REMAINS_UNKNOWN',
        commandHash: command.commandHash,
        providerStatus,
        providerReference,
        canonicalTruthEstablished: false,
        providerMutationAuthorizedByWorkflow: false,
        nextGate: 'ADDITIONAL_EVIDENCE_OR_HUMAN_ADJUDICATION_REQUIRED',
      };
    }

    return {
      state: verificationState,
      commandHash: command.commandHash,
      providerStatus,
      providerReference,
      verificationReceipt: verificationEvent.payload,
      canonicalTruthEstablished: false,
      providerMutationAuthorizedByWorkflow: false,
      nextGate: 'WRITE_AND_REREAD_CANONICAL_FCR_SUPABASE_TERMINAL_RECEIPT',
    };
  }
}
