import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';

import {
  RELEASE_PROOF_SCHEMA,
  bindReleaseProofCandidate,
  buildReleaseProofReceipt,
  evaluateFounderApprovalObservation,
  evaluateReleaseEvidence,
  type FounderApprovalObservation,
  type ReleaseEvidenceObservation,
  type ReleaseProofCandidate,
} from './releaseProofContract.js';

type ReleaseProofWorkflowEnv = Record<string, unknown>;

function blockedReceipt(
  bound: ReturnType<typeof bindReleaseProofCandidate>,
  state: 'BLOCKED' | 'HOLD',
  reason: string,
) {
  return {
    schemaVersion: RELEASE_PROOF_SCHEMA,
    state,
    reason,
    ...bound.candidate,
    candidateFingerprint: bound.candidateFingerprint,
    candidateCookie: bound.candidateCookie,
    founderApprovalObserved: false,
    mergeAuthorized: false,
    deploymentAuthorized: false,
    providerMutationAuthorized: false,
    nextGate: 'REPAIR_OR_REACQUIRE_EVIDENCE_BEFORE_CONTINUING' as const,
  };
}

/**
 * Durable release-proof orchestration only.
 *
 * This Workflow cannot merge, deploy, mutate Cloudflare, or treat an event as
 * execution authority. It correlates exact release/evidence/founder receipts,
 * then stops at READY_FOR_FINAL_REREAD so the repository's existing authority
 * contract can perform the final mutable provider reread and any later action.
 *
 * Fingerprints identify immutable subjects. Continuity cookies cryptographically
 * chain the currently valid candidate -> evidence -> founder-authority path.
 * A moved candidate or replayed predecessor cookie fails closed rather than
 * borrowing historical proof.
 */
export class ReleaseProofWorkflowV0 extends WorkflowEntrypoint<ReleaseProofWorkflowEnv, ReleaseProofCandidate> {
  async run(event: WorkflowEvent<ReleaseProofCandidate>, step: WorkflowStep) {
    const bound = await step.do('bind exact release candidate', async () =>
      bindReleaseProofCandidate(event.payload));

    const evidenceEvent = await step.waitForEvent<ReleaseEvidenceObservation>(
      'await exact evidence packet',
      {
        type: 'release_evidence_ready',
        timeout: '24 hours',
      },
    );

    const evidence = await step.do('validate evidence fingerprint and continuity cookie', async () =>
      evaluateReleaseEvidence(bound, evidenceEvent.payload));

    if (evidence.state !== 'EVIDENCE_CLEAR') {
      return blockedReceipt(bound, 'BLOCKED', evidence.reason);
    }

    const founderEvent = await step.waitForEvent<FounderApprovalObservation>(
      'await founder approval observation',
      {
        type: 'founder_approval_observed',
        timeout: '24 hours',
      },
    );

    const founder = await step.do('validate founder fingerprint and evidence cookie chain', async () =>
      evaluateFounderApprovalObservation(bound, evidence, founderEvent.payload));

    if (founder.state !== 'FOUNDER_APPROVAL_OBSERVED') {
      return blockedReceipt(bound, 'HOLD', founder.reason);
    }

    return step.do('freeze non-authorizing release proof receipt', async () =>
      buildReleaseProofReceipt(bound, evidence, founder));
  }
}
