import {
  dispatchTemporallyGovernedFounderContentPublishNow,
  type TemporallyGovernedFounderPublishOptions,
  type TemporallyGovernedFounderPublishResult,
} from './temporallyGovernedFounderContentExecutor.js';
import {
  claimFounderContentApproval,
  readCurrentFounderContentApproval,
  type FounderContentApprovalRepository,
} from './founderContentApprovalStore.js';
import { FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT } from './firstPartyFounderContentExecutor.js';

type JsonRecord = Record<string, unknown>;

export interface AuthoritativeFounderContentPublishInput {
  proposal: JsonRecord;
  approval_id: string;
  confirmation: {
    confirm_publication?: boolean;
    authorization_hash?: string;
    public_payload_hash?: string;
    truth_context_hash?: string;
  };
}

export interface AuthoritativeFounderContentPublishOptions extends TemporallyGovernedFounderPublishOptions {
  founderUserId: string;
  founderIdentity: string;
  approvalRepository?: FounderContentApprovalRepository;
  /** Test seam for the final atomic claim clock. Production uses a fresh clock at provider dispatch. */
  claimNow?: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

function blocked(reasons: string[]): TemporallyGovernedFounderPublishResult {
  return {
    ok: false,
    code: 'INVALID_AUTHORIZATION',
    status: 409,
    contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
    truthState: 'BLOCKED',
    published: false,
    retrySafe: false,
    freshApprovalMayRetry: true,
    executionId: null,
    receipt: null,
    providerEvidence: null,
    reasons,
    temporalTruth: null,
    temporalAnalytics: null,
  };
}

/**
 * Execution membrane for direct founder publication.
 *
 * The caller may present an approval id and exact-copy confirmation, but never an
 * approval object. FCR first performs a non-consuming exact-current read, then
 * runs the existing temporal/provider/project/reservation preflights. The atomic
 * one-shot claim is injected at the first provider-fetch boundary, after those
 * preflights and immediately before any LinkedIn request can leave FCR.
 */
export async function dispatchAuthoritativeFounderContentPublishNow(
  input: AuthoritativeFounderContentPublishInput,
  options: AuthoritativeFounderContentPublishOptions,
): Promise<TemporallyGovernedFounderPublishResult> {
  const founderUserId = text(options.founderUserId);
  const founderIdentity = text(options.founderIdentity).toLowerCase();
  const approvalId = text(input.approval_id).toLowerCase();
  const authorizationHash = text(input.confirmation?.authorization_hash).toLowerCase();
  const publicPayloadHash = text(input.confirmation?.public_payload_hash).toLowerCase();
  const now = options.now ?? new Date().toISOString();

  const reasons: string[] = [];
  if (!founderUserId) reasons.push('authenticated founder user id is required');
  if (!founderIdentity) reasons.push('authenticated founder execution identity is required');
  if (!approvalId) reasons.push('approval_id must reference an FCR-issued approval');
  if (input.confirmation?.confirm_publication !== true) reasons.push('confirm_publication must be true');
  if (!authorizationHash) reasons.push('authorization_hash confirmation is required');
  if (!publicPayloadHash) reasons.push('public_payload_hash confirmation is required');
  if (reasons.length > 0) return blocked(reasons);

  const current = await readCurrentFounderContentApproval({
    proposal: input.proposal,
    founderUserId,
    approvalId,
    authorizationHash,
    expectedPublicPayloadHash: publicPayloadHash,
    now,
    repository: options.approvalRepository,
  });
  if (!current.ok) {
    return blocked([
      'publication stopped because FCR could not read a current authoritative ApprovalReceipt',
      current.reason,
    ]);
  }
  if (
    current.approvalId !== approvalId
    || current.publicPayloadHash !== publicPayloadHash
    || current.authorizationHash !== authorizationHash
  ) {
    return blocked(['current authoritative approval does not match the exact browser confirmation']);
  }

  const storedCurrentYou = current.approval.current_you as JsonRecord | undefined;
  const intentVersion = positiveInteger(storedCurrentYou?.intent_version);
  if (!intentVersion) {
    return blocked(['current authoritative approval has an invalid Current You intent version']);
  }

  const providerFetch = options.fetchImpl ?? fetch;
  let approvalClaimed = false;
  let finalClaimFailure: string | null = null;

  const claimThenFetch: typeof fetch = async (resource, init) => {
    if (!approvalClaimed) {
      const claimNow = options.claimNow ?? new Date().toISOString();
      const claim = await claimFounderContentApproval({
        proposal: input.proposal,
        founderUserId,
        approvalId,
        authorizationHash,
        expectedPublicPayloadHash: publicPayloadHash,
        consumedBy: founderIdentity,
        now: claimNow,
        repository: options.approvalRepository,
      });
      if (!claim.ok) {
        finalClaimFailure = `publication stopped because FCR could not atomically claim the current ApprovalReceipt: ${claim.reason}`;
        throw new Error('FOUNDER_CONTENT_FINAL_APPROVAL_CLAIM_FAILED');
      }
      if (
        claim.approvalId !== current.approvalId
        || claim.publicPayloadHash !== current.publicPayloadHash
        || claim.authorizationHash !== current.authorizationHash
      ) {
        finalClaimFailure = 'atomically claimed approval differs from the exact approval that passed preflight';
        throw new Error('FOUNDER_CONTENT_FINAL_APPROVAL_CLAIM_MISMATCH');
      }
      approvalClaimed = true;
    }

    return providerFetch(resource, init);
  };

  const result = await dispatchTemporallyGovernedFounderContentPublishNow({
    proposal: input.proposal,
    approval: current.approval,
    confirmation: {
      confirm_publication: true,
      authorization_hash: current.authorizationHash,
      public_payload_hash: current.publicPayloadHash,
      truth_context_hash: text(input.confirmation?.truth_context_hash),
    },
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: text(storedCurrentYou?.intent_id),
      intent_version: intentVersion,
      observed_at: now,
    },
  }, {
    ...options,
    now,
    executedBy: founderIdentity,
    fetchImpl: claimThenFetch,
  });

  if (finalClaimFailure) {
    return {
      ...result,
      ok: false,
      code: 'INVALID_AUTHORIZATION',
      status: 409,
      truthState: 'BLOCKED',
      published: false,
      retrySafe: false,
      freshApprovalMayRetry: true,
      receipt: null,
      providerEvidence: {
        ...(result.providerEvidence ?? {}),
        providerWriteAttempted: false,
        finalApprovalClaimed: false,
      },
      reasons: [
        finalClaimFailure,
        'the durable execution reservation reached a terminal non-success state without a provider request',
      ],
    };
  }

  if (result.published && !approvalClaimed) {
    return {
      ...result,
      ok: false,
      code: 'INVALID_AUTHORIZATION',
      status: 500,
      truthState: 'BLOCKED',
      published: false,
      retrySafe: false,
      freshApprovalMayRetry: true,
      receipt: null,
      providerEvidence: {
        ...(result.providerEvidence ?? {}),
        finalApprovalClaimed: false,
      },
      reasons: ['publication result was rejected because no final atomic founder approval claim occurred'],
    };
  }

  return result;
}
