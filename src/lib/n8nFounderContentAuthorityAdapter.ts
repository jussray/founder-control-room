import {
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
  readN8nFounderContentProviderConfig,
  resolveN8nFounderContentProvider,
  type N8nFounderContentProvider,
} from './n8nProviderNeutralFounderContentOrchestrator.js';
import {
  prepareProviderNeutralN8nFounderContent,
  type PreparedProviderNeutralN8nFounderContent,
} from './n8nProviderNeutralFounderContentPreparation.js';
import {
  readN8nFounderContentConfig,
  type N8nFounderContentDispatchResult,
} from './n8nFounderContentOrchestrator.js';
import {
  readCurrentFounderContentApproval,
  type FounderContentApprovalRepository,
} from './founderContentApprovalStore.js';
import {
  claimFounderContentApprovalForExecutionGeneration,
} from './atomicFounderContentExecutionClaim.js';

type JsonRecord = Record<string, unknown>;

export interface AuthoritativeN8nFounderContentInput {
  proposal: JsonRecord;
  approval_id: string;
  n8n_provider?: string;
  confirmation: {
    confirm_publication?: boolean;
    authorization_hash?: string;
    public_payload_hash?: string;
  };
}

export interface AuthoritativeN8nFounderContentOptions {
  founderUserId: string;
  founderIdentity: string;
  now?: string;
  claimNow?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  approvalRepository?: FounderContentApprovalRepository;
  prepare?: typeof prepareProviderNeutralN8nFounderContent;
  atomicClaim?: typeof claimFounderContentApprovalForExecutionGeneration;
}

export type AuthoritativeN8nFounderContentResult = N8nFounderContentDispatchResult | {
  ok: false;
  code: 'INVALID_AUTHORIZATION';
  status: 409;
  request: null;
  receipt: null;
  reasons: string[];
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function blocked(reasons: string[]): AuthoritativeN8nFounderContentResult {
  return {
    ok: false,
    code: 'INVALID_AUTHORIZATION',
    status: 409,
    request: null,
    receipt: null,
    reasons,
  };
}

function preflightFailure(
  code: Extract<N8nFounderContentDispatchResult['code'], 'ORCHESTRATION_DISABLED' | 'ORCHESTRATION_NOT_CONFIGURED' | 'INVALID_ENVELOPE'>,
  status: number,
  reasons: string[],
): N8nFounderContentDispatchResult {
  return { ok: false, code, status, request: null, receipt: null, reasons };
}

async function abortPreparedReservation(
  prepared: PreparedProviderNeutralN8nFounderContent,
  reason: string,
): Promise<string | null> {
  try {
    const aborted = await prepared.abort(reason);
    return aborted
      ? null
      : 'prepared execution reservation could not be marked retryable; reconcile the pending reservation before retry';
  } catch {
    return 'prepared execution reservation abort outcome is unknown; reconcile the pending reservation before retry';
  }
}

function alignAndVerifyPreparedReviewDeadline(
  prepared: PreparedProviderNeutralN8nFounderContent,
): string | null {
  const scheduleAt = text(prepared.request.providerRequest.scheduleAt);
  const scheduleMs = Date.parse(scheduleAt);
  if (!scheduleAt || !Number.isFinite(scheduleMs)) {
    return 'prepared founder-content provider schedule is invalid';
  }

  const reviewDeadline = text(prepared.request.providerRequest.reviewDeadline);
  if (!reviewDeadline) {
    prepared.request.providerRequest.reviewDeadline = scheduleAt;
    return null;
  }

  const reviewDeadlineMs = Date.parse(reviewDeadline);
  if (!Number.isFinite(reviewDeadlineMs)) {
    return 'prepared founder-content review-window boundary is invalid';
  }

  if (reviewDeadlineMs < scheduleMs) {
    prepared.request.providerRequest.reviewDeadline = scheduleAt;
    return null;
  }

  if (reviewDeadlineMs > scheduleMs) {
    return 'prepared founder-content review deadline must match the provider schedule after cadence';
  }

  return null;
}

function preparedClaimBoundaryFailure(
  prepared: PreparedProviderNeutralN8nFounderContent,
  approval: JsonRecord,
  claimNow: string,
): string | null {
  const claimMs = Date.parse(claimNow);
  const approvalExpiresAt = text(approval.expires_at);
  const approvalExpiresMs = Date.parse(approvalExpiresAt);
  const scheduleAt = text(prepared.request.providerRequest.scheduleAt);
  const scheduleMs = Date.parse(scheduleAt);
  const reviewDeadline = text(prepared.request.providerRequest.reviewDeadline);
  const reviewDeadlineMs = reviewDeadline ? Date.parse(reviewDeadline) : null;

  if (
    !Number.isFinite(claimMs)
    || !Number.isFinite(approvalExpiresMs)
    || !Number.isFinite(scheduleMs)
    || (reviewDeadlineMs !== null && !Number.isFinite(reviewDeadlineMs))
  ) {
    return 'prepared founder-content claim boundary contains an invalid timestamp';
  }
  if (claimMs >= approvalExpiresMs) {
    return 'authoritative founder approval expired during downstream preparation';
  }
  if (scheduleMs <= claimMs) {
    return 'prepared provider schedule is no longer in the future at the approval claim boundary';
  }
  if (reviewDeadlineMs !== null && claimMs >= reviewDeadlineMs) {
    return 'founder-content review window expired before the final approval claim';
  }
  if (scheduleMs >= approvalExpiresMs) {
    return 'prepared provider schedule is not before the exact founder approval expiry';
  }
  return null;
}

/**
 * FCR-owned authority membrane for provider-neutral founder-content orchestration.
 *
 * Transport readiness, cadence, exact approval-expiry bounds, source-project
 * resolution, and the durable execution reservation all complete before FCR
 * consumes one-shot founder authority. The final approval consumption is bound
 * in one database transaction to the exact database-returned execution
 * generation. A stale/rearmed worker therefore cannot burn one-shot authority
 * before its later provider-write fence rejects it.
 */
export async function dispatchAuthoritativeN8nFounderContent(
  input: AuthoritativeN8nFounderContentInput,
  options: AuthoritativeN8nFounderContentOptions,
): Promise<AuthoritativeN8nFounderContentResult> {
  const founderUserId = text(options.founderUserId);
  const founderIdentity = text(options.founderIdentity).toLowerCase();
  const approvalId = text(input.approval_id).toLowerCase();
  const authorizationHash = text(input.confirmation?.authorization_hash).toLowerCase();
  const publicPayloadHash = text(input.confirmation?.public_payload_hash).toLowerCase();
  const requestedProvider = text(input.n8n_provider).toLowerCase() || 'buffer';
  const now = options.now ?? new Date().toISOString();

  const reasons: string[] = [];
  if (!founderUserId) reasons.push('authenticated founder user id is required');
  if (!founderIdentity) reasons.push('authenticated founder execution identity is required');
  if (!approvalId) reasons.push('approval_id must reference an FCR-issued approval');
  if (input.confirmation?.confirm_publication !== true) reasons.push('confirm_publication must be true');
  if (!authorizationHash) reasons.push('authorization_hash confirmation is required');
  if (!publicPayloadHash) reasons.push('public_payload_hash confirmation is required');
  if (Object.hasOwn(input as unknown as JsonRecord, 'approval')) reasons.push('caller-supplied approval objects are forbidden');
  if (reasons.length > 0) return blocked(reasons);

  const env = options.env ?? process.env;
  const transport = readN8nFounderContentConfig(env);
  if (!transport.enabled) {
    return preflightFailure('ORCHESTRATION_DISABLED', 503, [
      'n8n founder-content orchestration is disabled',
      'FCR did not consume the one-shot approval',
    ]);
  }
  if (!transport.configured || !transport.webhookUrl || !transport.bearerToken) {
    return preflightFailure('ORCHESTRATION_NOT_CONFIGURED', 503, [
      'n8n founder-content webhook and bearer token must be configured',
      'FCR did not consume the one-shot approval',
    ]);
  }

  const providers = readN8nFounderContentProviderConfig(env);
  if (providers.invalidProviders.length > 0) {
    return preflightFailure('ORCHESTRATION_NOT_CONFIGURED', 503, [
      `n8n founder-content provider allowlist contains unsupported values: ${providers.invalidProviders.join(', ')}`,
      'FCR did not consume the one-shot approval',
    ]);
  }
  if (!(requestedProvider in N8N_FOUNDER_CONTENT_PROVIDER_ROUTES)) {
    return preflightFailure('INVALID_ENVELOPE', 400, [
      `unsupported n8n founder-content provider ${requestedProvider}`,
      'FCR did not consume the one-shot approval',
    ]);
  }
  if (!providers.enabledProviders.includes(requestedProvider as N8nFounderContentProvider)) {
    return preflightFailure('ORCHESTRATION_NOT_CONFIGURED', 503, [
      `n8n provider ${requestedProvider} is contract-capable but not runtime-enabled`,
      'FCR did not consume the one-shot approval',
    ]);
  }

  const platform = text(record(input.proposal.public_payload).platform).toLowerCase();
  try {
    resolveN8nFounderContentProvider({ n8n_provider: requestedProvider }, platform);
  } catch (error) {
    return preflightFailure('INVALID_ENVELOPE', 400, [
      error instanceof Error ? error.message : 'provider/platform preflight failed',
      'FCR did not consume the one-shot approval',
    ]);
  }

  let preview;
  try {
    preview = await readCurrentFounderContentApproval({
      proposal: input.proposal,
      founderUserId,
      approvalId,
      authorizationHash,
      expectedPublicPayloadHash: publicPayloadHash,
      now,
      repository: options.approvalRepository,
    });
  } catch (error) {
    return blocked([
      'provider orchestration stopped because FCR could not read current approval authority',
      error instanceof Error ? error.message : 'authoritative approval readback failed',
    ]);
  }

  if (!preview.ok) {
    return blocked([
      'provider orchestration stopped because FCR could not read a current authoritative ApprovalReceipt',
      preview.reason,
    ]);
  }
  if (
    preview.approvalId !== approvalId
    || preview.publicPayloadHash !== publicPayloadHash
    || preview.authorizationHash !== authorizationHash
  ) {
    return blocked(['current authoritative approval does not match the exact founder confirmation']);
  }

  const prepare = options.prepare ?? prepareProviderNeutralN8nFounderContent;
  let preparedResult;
  try {
    preparedResult = await prepare({
      n8n_provider: requestedProvider,
      proposal: input.proposal,
      approval: preview.approval,
      now,
    }, {
      env,
      fetchImpl: options.fetchImpl,
      executedBy: founderIdentity,
      preclaimRecoveryAuthorizedAt: now,
    });
  } catch (error) {
    return {
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
      status: 503,
      request: null,
      receipt: null,
      reasons: [
        error instanceof Error ? error.message : 'downstream founder-content preparation failed',
        'FCR did not consume the one-shot approval',
      ],
    };
  }

  if (!preparedResult.prepared) {
    return {
      ...preparedResult.result,
      reasons: [
        ...preparedResult.result.reasons,
        'FCR did not consume the one-shot approval',
      ],
    };
  }
  const prepared = preparedResult;
  const reviewDeadlineFailure = alignAndVerifyPreparedReviewDeadline(prepared);
  if (reviewDeadlineFailure) {
    const abortWarning = await abortPreparedReservation(
      prepared,
      'prepared founder-content review-window boundary was invalid before approval claim',
    );
    return blocked([
      reviewDeadlineFailure,
      'FCR did not consume the one-shot approval',
      ...(abortWarning ? [abortWarning] : []),
    ]);
  }

  const claimNow = options.claimNow ?? (options.now ?? new Date().toISOString());
  const claimBoundaryFailure = preparedClaimBoundaryFailure(
    prepared,
    record(preview.approval),
    claimNow,
  );
  if (claimBoundaryFailure) {
    const abortWarning = await abortPreparedReservation(
      prepared,
      'prepared founder-content authority became stale before approval claim',
    );
    return blocked([
      claimBoundaryFailure,
      'FCR did not consume the one-shot approval',
      ...(abortWarning ? [abortWarning] : []),
    ]);
  }

  const executionStartedAt = text(prepared.reservationStartedAt);
  if (!executionStartedAt || !Number.isFinite(Date.parse(executionStartedAt))) {
    const abortWarning = await abortPreparedReservation(
      prepared,
      'prepared founder-content execution did not expose an authoritative reservation generation',
    );
    return blocked([
      'prepared execution reservation did not expose the database-returned started_at generation required for atomic approval claim',
      'FCR did not consume the one-shot approval',
      'no provider request was attempted',
      ...(abortWarning ? [abortWarning] : []),
    ]);
  }

  const atomicClaim = options.atomicClaim ?? claimFounderContentApprovalForExecutionGeneration;
  let claim;
  try {
    claim = await atomicClaim({
      executionId: prepared.executionId,
      executionStartedAt,
      approvalId,
      founderUserId,
      proposalHash: text(input.proposal.proposal_hash).toLowerCase(),
      publicPayloadHash,
      authorizationHash,
      consumedBy: founderIdentity,
      now: claimNow,
    });
  } catch (error) {
    return blocked([
      'atomic founder-content approval claim outcome is unknown; reconcile the execution and approval ledgers before retry',
      error instanceof Error ? error.message : 'atomic execution-bound approval claim failed',
      'no provider request was attempted',
    ]);
  }

  if (!claim.ok) {
    if (claim.code === 'CLAIM_STORE_FAILED') {
      return blocked([
        'atomic founder-content approval claim outcome could not be proven; reconcile the execution and approval ledgers before retry',
        claim.reason,
        'no provider request was attempted',
      ]);
    }

    const abortWarning = await abortPreparedReservation(
      prepared,
      'atomic founder-content approval claim rejected the stale or non-current execution generation',
    );
    return blocked([
      'provider orchestration stopped because the exact execution generation could not atomically claim current founder authority',
      claim.reason,
      'FCR did not consume the one-shot approval',
      'no provider request was attempted',
      ...(abortWarning ? [abortWarning] : []),
    ]);
  }

  if (
    claim.approvalId !== approvalId
    || claim.publicPayloadHash !== publicPayloadHash
    || claim.authorizationHash !== authorizationHash
    || Date.parse(claim.executionStartedAt) !== Date.parse(executionStartedAt)
  ) {
    return blocked([
      'atomic founder-content approval claim returned mismatched authority evidence; reconcile before retry',
      'the approval may already be consumed, so FCR will not rewrite the execution reservation automatically',
      'no provider request was attempted',
    ]);
  }

  return prepared.dispatch();
}
