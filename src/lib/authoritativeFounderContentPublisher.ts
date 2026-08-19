import {
  dispatchTemporallyGovernedFounderContentPublishNow,
  type TemporallyGovernedFounderPublishOptions,
  type TemporallyGovernedFounderPublishResult,
} from './temporallyGovernedFounderContentExecutor.js';
import {
  claimFounderContentApproval,
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
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
 * approval object. FCR atomically claims the exact stored approval, then injects
 * that authoritative row into the existing temporal + provider executor.
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

  const claim = await claimFounderContentApproval({
    proposal: input.proposal,
    founderUserId,
    approvalId,
    authorizationHash,
    consumedBy: founderIdentity,
    now,
    repository: options.approvalRepository,
  });
  if (!claim.ok) {
    return blocked([
      'publication stopped because FCR could not claim a current authoritative ApprovalReceipt',
      claim.reason,
    ]);
  }
  if (claim.publicPayloadHash !== publicPayloadHash || claim.authorizationHash !== authorizationHash) {
    return blocked(['claimed authoritative approval does not match the exact browser confirmation']);
  }

  return dispatchTemporallyGovernedFounderContentPublishNow({
    proposal: input.proposal,
    approval: claim.approval,
    confirmation: {
      confirm_publication: true,
      authorization_hash: claim.authorizationHash,
      public_payload_hash: claim.publicPayloadHash,
      truth_context_hash: text(input.confirmation?.truth_context_hash),
    },
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: text((claim.approval.current_you as JsonRecord | undefined)?.intent_id),
      intent_version: (claim.approval.current_you as JsonRecord | undefined)?.intent_version,
      observed_at: now,
    },
  }, {
    ...options,
    now,
    executedBy: founderIdentity,
  });
}
