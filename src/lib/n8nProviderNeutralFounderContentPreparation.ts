import {
  applyFounderContentCadenceSchedule,
  reserveFounderContentCadence,
} from './founderContentCadence.js';
import {
  N8N_FOUNDER_CONTENT_CONTRACT,
  acquireN8nFounderContentProviderWrite,
  finalizeN8nFounderContentExecution,
  readN8nFounderContentConfig,
  reserveN8nFounderContentExecution,
  type FirstPartyFounderDistributionInput,
  type FirstPartyFounderScheduleEnvelope,
  type FounderContentReservationResult,
  type N8nFounderContentDispatchResult,
  type N8nFounderContentReceiptInput,
  type N8nFounderContentRequest,
} from './n8nFounderContentOrchestrator.js';
import {
  buildProviderNeutralN8nFounderContentEnvelope,
  buildProviderNeutralN8nFounderContentRequest,
  readN8nFounderContentProviderConfig,
  verifyProviderNeutralN8nFounderContentReceipt,
  type N8nFounderContentProvider,
} from './n8nProviderNeutralFounderContentOrchestrator.js';

const PROVIDER_NEUTRAL_CADENCE_PROVIDER = 'n8n' as const;
const FOUNDER_CONTENT_ACTION = 'schedule_founder_content' as const;
const PRECLAIM_RESERVATION_LEASE_MS = 2 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

export interface PrepareProviderNeutralN8nFounderContentOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  executedBy?: string;
  preclaimRecoveryAuthorizedAt?: string;
}

export interface PreparedProviderNeutralN8nFounderContent {
  prepared: true;
  request: N8nFounderContentRequest;
  executionId: string;
  acquireApprovalClaimBoundary(): Promise<boolean>;
  dispatch(): Promise<N8nFounderContentDispatchResult>;
  abort(reason?: string): Promise<boolean>;
}

export type PrepareProviderNeutralN8nFounderContentResult =
  | PreparedProviderNeutralN8nFounderContent
  | { prepared: false; result: N8nFounderContentDispatchResult };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function failure(
  code: N8nFounderContentDispatchResult['code'],
  status: number,
  request: N8nFounderContentRequest | null,
  reasons: string[],
): PrepareProviderNeutralN8nFounderContentResult {
  return {
    prepared: false,
    result: { ok: false, code, status, request, receipt: null, reasons },
  };
}

function assertScheduleBeforeApprovalExpiry(scheduleAt: string, expiresAt: string): void {
  const scheduleMs = Date.parse(scheduleAt);
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(scheduleMs) || !Number.isFinite(expiresMs)) {
    throw new Error('N8N_FOUNDER_CONTENT_CADENCE_AUTHORITY_REJECTED: cadence schedule or approval expiry is invalid');
  }
  if (scheduleMs >= expiresMs) {
    throw new Error('N8N_FOUNDER_CONTENT_CADENCE_AUTHORITY_REJECTED: cadence-adjusted schedule must remain before exact founder approval expiry');
  }
}

export function isRecoverableAbandonedPreclaimReservation(input: {
  status: unknown;
  startedAt: unknown;
  providerWriteAttempted: unknown;
  preclaimRecoveryAuthorizedAt: unknown;
}): boolean {
  const startedAtMs = Date.parse(text(input.startedAt));
  const recoveryAuthorizedAtMs = Date.parse(text(input.preclaimRecoveryAuthorizedAt));
  return text(input.status) === 'pending'
    && input.providerWriteAttempted !== true
    && Number.isFinite(startedAtMs)
    && Number.isFinite(recoveryAuthorizedAtMs)
    && recoveryAuthorizedAtMs - startedAtMs >= PRECLAIM_RESERVATION_LEASE_MS;
}

function executionAuditRequest(request: N8nFounderContentRequest): JsonRecord {
  return {
    contract: request.contract,
    orchestrationId: request.orchestrationId,
    contentId: request.contentId,
    platform: request.platform,
    channel: request.channel,
    source: request.source,
    authorizationHash: request.fcrAuthorization.authorizationHash,
    proposalHash: request.fcrAuthorization.proposalHash,
    publicPayloadHash: request.fcrAuthorization.publicPayloadHash,
    currentYouIntentId: request.fcrAuthorization.currentYouIntentId,
    currentYouIntentVersion: request.fcrAuthorization.currentYouIntentVersion,
    provider: request.providerRequest.provider,
    scheduleAt: request.providerRequest.scheduleAt,
  };
}

async function founderContentDb() {
  const { supabase } = await import('./supabaseClient.js');
  return supabase;
}

async function tryRearmRetryablePreProviderReservation(
  request: N8nFounderContentRequest,
  executedBy: string,
  first: FounderContentReservationResult,
  preclaimRecoveryAuthorizedAt: string,
): Promise<FounderContentReservationResult> {
  if (first.ok || first.code !== 'ACTION_ALREADY_RESERVED') return first;

  const supabase = await founderContentDb();
  const { data: existing, error: existingError } = await supabase
    .from('approval_executions')
    .select('id, project_id, action_type, status, result, started_at')
    .eq('idempotency_key', request.orchestrationId)
    .maybeSingle();

  if (existingError) {
    return {
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
      reason: `pre-provider reservation recovery lookup failed: ${existingError.message}`,
    };
  }

  const result = record(existing?.result);
  const retryableFailed = Boolean(
    existing
    && text(existing.status) === 'failed'
    && result.retryable_before_provider === true
    && result.provider_write_attempted === false
  );
  const abandonedPending = Boolean(
    existing
    && isRecoverableAbandonedPreclaimReservation({
      status: existing.status,
      startedAt: existing.started_at,
      providerWriteAttempted: result.provider_write_attempted,
      preclaimRecoveryAuthorizedAt,
    })
  );

  if (
    !existing
    || text(existing.action_type) !== FOUNDER_CONTENT_ACTION
    || (!retryableFailed && !abandonedPending)
  ) {
    return first;
  }

  const reservationStartedAt = new Date().toISOString();
  const rearmPayload = {
    executed_by: executedBy,
    status: 'pending',
    request: executionAuditRequest(request),
    result: {
      resumed_from_pre_provider_failure: retryableFailed,
      resumed_from_abandoned_preclaim_reservation: abandonedPending,
      provider_write_attempted: false,
    },
    success: null,
    started_at: reservationStartedAt,
    executed_at: null,
  };

  let rearmed: { id?: unknown; project_id?: unknown; started_at?: unknown } | null = null;
  let rearmError: { message: string } | null = null;
  if (abandonedPending) {
    const update = await supabase
      .from('approval_executions')
      .update(rearmPayload)
      .eq('id', existing.id)
      .eq('status', 'pending')
      .eq('started_at', text(existing.started_at))
      .eq('result->>provider_write_attempted', 'false')
      .select('id, project_id, started_at')
      .maybeSingle();
    rearmed = update.data;
    rearmError = update.error;
  } else {
    const update = await supabase
      .from('approval_executions')
      .update(rearmPayload)
      .eq('id', existing.id)
      .eq('status', 'failed')
      .eq('started_at', text(existing.started_at))
      .eq('result->>provider_write_attempted', 'false')
      .select('id, project_id, started_at')
      .maybeSingle();
    rearmed = update.data;
    rearmError = update.error;
  }

  if (rearmError) {
    return {
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
      reason: `pre-provider reservation recovery failed: ${rearmError.message}`,
    };
  }
  if (!rearmed?.id) {
    return reserveN8nFounderContentExecution(request, executedBy);
  }

  const authoritativeReservationStartedAt = text(rearmed.started_at);
  if (!authoritativeReservationStartedAt) {
    return {
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
      reason: 'pre-provider reservation recovery did not return the authoritative started_at generation',
    };
  }

  return {
    ok: true,
    executionId: String(rearmed.id),
    projectId: String(rearmed.project_id ?? existing.project_id),
    reservationStartedAt: authoritativeReservationStartedAt,
  };
}

async function reservePreparedFounderContentExecution(
  request: N8nFounderContentRequest,
  executedBy: string,
  preclaimRecoveryAuthorizedAt: string,
): Promise<FounderContentReservationResult> {
  const first = await reserveN8nFounderContentExecution(request, executedBy);
  return tryRearmRetryablePreProviderReservation(
    request,
    executedBy,
    first,
    preclaimRecoveryAuthorizedAt,
  );
}

async function acquirePreparedFounderContentApprovalClaimBoundary(
  executionId: string,
  reservationStartedAt: string,
): Promise<string | null> {
  const generation = text(reservationStartedAt);
  const generationMs = Date.parse(generation);
  if (!generation || !Number.isFinite(generationMs)) return null;

  const claimBoundaryStartedAt = new Date(
    Math.max(Date.now(), generationMs + 1),
  ).toISOString();

  try {
    const supabase = await founderContentDb();
    const { data, error } = await supabase
      .from('approval_executions')
      .update({
        result: {
          phase: 'approval_claim_boundary_acquired',
          provider_write_attempted: false,
        },
        started_at: claimBoundaryStartedAt,
      })
      .eq('id', executionId)
      .eq('status', 'pending')
      .eq('started_at', generation)
      .eq('result->>provider_write_attempted', 'false')
      .select('id, started_at')
      .maybeSingle();

    return !error && String(data?.id ?? '') === executionId
      ? text(data?.started_at) || claimBoundaryStartedAt
      : null;
  } catch {
    return null;
  }
}

async function abortPreparedFounderContentExecution(
  executionId: string,
  reservationStartedAt: string,
  reason: string,
): Promise<boolean> {
  const generation = text(reservationStartedAt);
  if (!generation) return false;

  const supabase = await founderContentDb();
  const { data, error } = await supabase
    .from('approval_executions')
    .update({
      status: 'failed',
      result: {
        phase: 'pre_provider_approval_claim',
        reason: text(reason).slice(0, 500) || 'founder approval claim did not complete',
        retryable_before_provider: true,
        provider_write_attempted: false,
      },
      success: false,
      executed_at: new Date().toISOString(),
    })
    .eq('id', executionId)
    .eq('status', 'pending')
    .eq('started_at', generation)
    .select('id')
    .maybeSingle();

  return !error && String(data?.id ?? '') === executionId;
}

export async function prepareProviderNeutralN8nFounderContent(
  input: FirstPartyFounderDistributionInput,
  options: PrepareProviderNeutralN8nFounderContentOptions = {},
): Promise<PrepareProviderNeutralN8nFounderContentResult> {
  let envelope: FirstPartyFounderScheduleEnvelope;
  let request: N8nFounderContentRequest;

  try {
    envelope = buildProviderNeutralN8nFounderContentEnvelope(input);
    request = buildProviderNeutralN8nFounderContentRequest(envelope);
  } catch (error) {
    return failure('INVALID_ENVELOPE', 400, null, [
      error instanceof Error ? error.message : 'invalid provider-neutral founder-content input',
    ]);
  }

  const env = options.env ?? process.env;
  const config = readN8nFounderContentConfig(env);
  if (!config.enabled) {
    return failure('ORCHESTRATION_DISABLED', 503, request, ['n8n founder-content orchestration is disabled']);
  }
  if (!config.configured || !config.webhookUrl || !config.bearerToken) {
    return failure('ORCHESTRATION_NOT_CONFIGURED', 503, request, [
      'n8n founder-content webhook and bearer token must be configured',
    ]);
  }

  const providerConfig = readN8nFounderContentProviderConfig(env);
  if (providerConfig.invalidProviders.length > 0) {
    return failure('ORCHESTRATION_NOT_CONFIGURED', 503, request, [
      `n8n founder-content provider allowlist contains unsupported values: ${providerConfig.invalidProviders.join(', ')}`,
    ]);
  }
  if (!providerConfig.enabledProviders.includes(request.providerRequest.provider as N8nFounderContentProvider)) {
    return failure('ORCHESTRATION_NOT_CONFIGURED', 503, request, [
      `n8n provider ${request.providerRequest.provider} is contract-capable but not runtime-enabled`,
      'set N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS only after the matching n8n provider adapter is configured and verified',
    ]);
  }

  const executedBy = text(options.executedBy).toLowerCase();
  if (!executedBy) {
    return failure('EXECUTION_CONTEXT_REQUIRED', 500, request, [
      'server-authenticated founder identity is required before external orchestration',
    ]);
  }

  try {
    const approvalExpiresAt = text(record(input.approval).expires_at);
    const cadence = await reserveFounderContentCadence({
      provider: PROVIDER_NEUTRAL_CADENCE_PROVIDER,
      channel: request.platform,
      contentId: envelope.content_id,
      requestedScheduleAt: envelope.provider_request.schedule_at,
      approvalExpiresAt,
    });
    const cadenceProjection = applyFounderContentCadenceSchedule({
      provider: PROVIDER_NEUTRAL_CADENCE_PROVIDER,
      channel: request.platform,
      content_id: envelope.content_id,
      provider_request: { schedule_at: envelope.provider_request.schedule_at },
    }, cadence);
    assertScheduleBeforeApprovalExpiry(
      cadenceProjection.provider_request.schedule_at,
      approvalExpiresAt,
    );
    envelope = {
      ...envelope,
      provider_request: {
        ...envelope.provider_request,
        schedule_at: cadenceProjection.provider_request.schedule_at,
      },
    };
    request = buildProviderNeutralN8nFounderContentRequest(envelope);
  } catch (error) {
    return failure('CADENCE_RESERVATION_FAILED', 503, request, [
      error instanceof Error ? error.message : 'founder-content cadence reservation failed',
      'no external founder-content orchestration was attempted',
    ]);
  }

  const reservation = await reservePreparedFounderContentExecution(
    request,
    executedBy,
    text(options.preclaimRecoveryAuthorizedAt),
  );
  if (!reservation.ok) {
    return failure(
      reservation.code,
      reservation.code === 'ACTION_RESERVATION_FAILED' ? 503 : 409,
      request,
      [reservation.reason],
    );
  }

  const webhookUrl = config.webhookUrl;
  const bearerToken = config.bearerToken;
  const fetchImpl = options.fetchImpl ?? fetch;
  let reservationStartedAt = reservation.reservationStartedAt;
  let approvalClaimBoundaryAcquired = false;

  return {
    prepared: true,
    request,
    executionId: reservation.executionId,
    async acquireApprovalClaimBoundary() {
      if (approvalClaimBoundaryAcquired) return false;
      const acquiredGeneration = await acquirePreparedFounderContentApprovalClaimBoundary(
        reservation.executionId,
        reservationStartedAt,
      );
      if (!acquiredGeneration) return false;
      reservationStartedAt = acquiredGeneration;
      approvalClaimBoundaryAcquired = true;
      return true;
    },
    abort: (reason = 'founder approval claim did not complete after downstream preparation') => (
      abortPreparedFounderContentExecution(
        reservation.executionId,
        reservationStartedAt,
        reason,
      )
    ),
    async dispatch() {
      const providerWriteAcquired = await acquireN8nFounderContentProviderWrite(
        reservation.executionId,
        reservationStartedAt,
      );
      if (!providerWriteAcquired) {
        return {
          ok: false,
          code: 'ACTION_AUDIT_INCOMPLETE',
          status: 409,
          request,
          receipt: null,
          reasons: [
            'FCR could not acquire the active reservation generation at the provider-write boundary',
            'no provider request was attempted',
          ],
        };
      }

      try {
        const response = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': request.orchestrationId,
            'X-FCR-Orchestration-Contract': N8N_FOUNDER_CONTENT_CONTRACT,
            'X-FCR-Social-Provider': request.providerRequest.provider,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(10_000),
        });

        let body: N8nFounderContentReceiptInput = {};
        try {
          body = await response.json() as N8nFounderContentReceiptInput;
        } catch {
          body = {};
        }

        if (!response.ok) {
          return {
            ok: false,
            code: 'UPSTREAM_REJECTED',
            status: 502,
            request,
            receipt: null,
            reasons: [
              `n8n rejected founder-content orchestration with HTTP ${response.status}`,
              'FCR reservation remains pending; do not retry this exact approval automatically',
            ],
          };
        }

        try {
          const receipt = verifyProviderNeutralN8nFounderContentReceipt(request, body);
          const finalized = await finalizeN8nFounderContentExecution(
            reservation.executionId,
            receipt,
            reservationStartedAt,
          );
          if (!finalized) {
            return {
              ok: false,
              code: 'ACTION_AUDIT_INCOMPLETE',
              status: 502,
              request,
              receipt,
              reasons: [
                'n8n accepted the request but FCR could not prove the pending reservation transitioned to succeeded',
                'do not retry this exact approval automatically; reconcile the execution ledger first',
              ],
            };
          }
          return { ok: true, code: 'DISPATCHED', status: 202, request, receipt, reasons: [] };
        } catch (error) {
          return {
            ok: false,
            code: 'UPSTREAM_RECEIPT_INVALID',
            status: 502,
            request,
            receipt: null,
            reasons: [
              error instanceof Error ? error.message : 'invalid n8n founder-content receipt',
              'FCR reservation remains pending; do not retry this exact approval automatically',
            ],
          };
        }
      } catch {
        return {
          ok: false,
          code: 'UPSTREAM_UNREACHABLE',
          status: 502,
          request,
          receipt: null,
          reasons: [
            'n8n founder-content webhook outcome is unknown',
            'FCR reservation remains pending; do not retry this exact approval automatically',
          ],
        };
      }
    },
  };
}
