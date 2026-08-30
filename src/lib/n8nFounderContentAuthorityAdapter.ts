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
  claimFounderContentApproval,
  readCurrentFounderContentApproval,
  type FounderContentApprovalRepository,
} from './founderContentApprovalStore.js';

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

  if (!Number.isFinite(claimMs) || !Number.isFinite(approvalExpiresMs) || !Number.isFinite(scheduleMs)) {
    return 'prepared founder-content claim boundary contains an invalid timestamp';
  }
  if (claimMs >= approvalExpiresMs) {
    return 'authoritative founder approval expired during downstream preparation';
  }
  if (scheduleMs <= claimMs) {
    return 'prepared provider schedule is no longer in the future at the approval claim boundary';
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
 * consumes one-shot founder authority. Only after those non-provider gates are
 * proven does FCR atomically claim the approval and permit the prepared request
 * to reach n8n. A failed approval claim aborts the prepared execution as a
 * retryable pre-provider failure; no provider write is attempted.
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

  let claim;
  try {
    claim = await claimFounderContentApproval({
      proposal: input.proposal,
      founderUserId,
      approvalId,
      authorizationHash,
      expectedPublicPayloadHash: publicPayloadHash,
      consumedBy: founderIdentity,
      now: claimNow,
      repository: options.approvalRepository,
    });
  } catch (error) {
    const abortWarning = await abortPreparedReservation(
      prepared,
      'authoritative approval claim threw before provider dispatch',
    );
    return blocked([
      'provider orchestration stopped because FCR could not validate the approval request',
      error instanceof Error ? error.message : 'authoritative approval validation failed',
      ...(abortWarning ? [abortWarning] : []),
    ]);
  }

  if (!claim.ok) {
    const abortWarning = await abortPreparedReservation(
      prepared,
      'authoritative approval claim was rejected before provider dispatch',
    );
    return blocked([
      'provider orchestration stopped because FCR could not claim a current authoritative ApprovalReceipt',
      claim.reason,
      ...(abortWarning ? [abortWarning] : []),
    ]);
  }
  if (
    claim.approvalId !== approvalId
    || claim.publicPayloadHash !== publicPayloadHash
    || claim.authorizationHash !== authorizationHash
  ) {
    const abortWarning = await abortPreparedReservation(
      prepared,
      'claimed approval identity did not match the prepared provider request',
    );
    return blocked([
      'claimed authoritative approval does not match the exact founder confirmation',
      ...(abortWarning ? [abortWarning] : []),
    ]);
  }

  return prepared.dispatch();
}
