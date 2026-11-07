import { createHash } from 'node:crypto';
import {
  applyFounderContentCadenceSchedule,
  reserveFounderContentCadence,
} from './founderContentCadence.js';
import { executionScopeMatches } from './idempotencyScope.js';
// @ts-expect-error -- the canonical #428 social-distribution contract is CommonJS and intentionally remains the single authority implementation.
import socialDistributionContract from '../../tools/founder-content-contracts/social-distribution-contract.cjs';

export const N8N_FOUNDER_CONTENT_CONTRACT = 'fcr/n8n-founder-content-orchestration@v1' as const;
export const N8N_FOUNDER_CONTENT_EVENT = 'founder-content.schedule.requested' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const MAX_TEXT = 5000;
const FOUNDER_CONTENT_ACTION = 'schedule_founder_content';

export type FirstPartyFounderDistributionInput = Record<string, unknown>;

export interface FirstPartyFounderScheduleEnvelope {
  version: number;
  lane: string;
  provider: string;
  state: string;
  content_id: string;
  platform: string;
  channel: string;
  text: string;
  source: {
    repo: string;
    commit_sha: string;
    proof_url?: string | null;
  };
  authority: {
    publish_allowed: boolean;
    schedule_allowed: boolean;
    standing_policy_applied: boolean;
    authorization_mode: string;
    authorization_receipt_verified: boolean;
    exact_current_you_approval_required?: boolean;
    first_party_founder_content?: boolean;
    founder_content_authorization_hash?: string;
    founder_content_proposal_hash?: string;
    public_payload_hash?: string;
    current_you_intent_id?: string;
    current_you_intent_version?: number;
  };
  provider_request: {
    method: string;
    save_to_draft: boolean;
    schedule_at: string;
    review_deadline?: string | null;
    review_window_minutes?: number | null;
    share_now_allowed: boolean;
    external_write_included: boolean;
  };
}

interface CanonicalSocialDistributionContract {
  buildFirstPartyFounderScheduleEnvelope(
    input: FirstPartyFounderDistributionInput,
  ): FirstPartyFounderScheduleEnvelope;
}

const canonicalSocialDistribution = socialDistributionContract as CanonicalSocialDistributionContract;

export interface N8nFounderContentRequest {
  contract: typeof N8N_FOUNDER_CONTENT_CONTRACT;
  event: typeof N8N_FOUNDER_CONTENT_EVENT;
  orchestrationId: string;
  contentId: string;
  platform: string;
  channel: string;
  text: string;
  source: {
    repo: string;
    commitSha: string;
  };
  fcrAuthorization: {
    mode: 'exact-current-you';
    authorizationHash: string;
    proposalHash: string;
    publicPayloadHash: string;
    currentYouIntentId: string;
    currentYouIntentVersion: number;
  };
  providerRequest: {
    provider: string;
    method: 'schedule';
    scheduleAt: string;
    reviewDeadline: string | null;
    reviewWindowMinutes: number | null;
    shareNowAllowed: false;
  };
  authority: {
    orchestrate: true;
    requestProviderWrite: true;
    authorizePublication: false;
    changeCopy: false;
    markPublished: false;
    readPrivateEvidence: false;
  };
}

export interface N8nFounderContentReceiptInput {
  orchestrationId?: unknown;
  provider?: unknown;
  state?: unknown;
  providerItemId?: unknown;
  providerRequestId?: unknown;
  published?: unknown;
}

export interface VerifiedN8nFounderContentReceipt {
  orchestrationId: string;
  provider: string;
  state: 'accepted' | 'scheduled';
  providerItemId: string | null;
  providerRequestId: string | null;
  truthState: 'provider_schedule_receipt_pending_readback';
  published: false;
  requiresProviderReadback: true;
}

export interface N8nFounderContentConfig {
  enabled: boolean;
  configured: boolean;
  webhookUrl: string | null;
  bearerToken: string | null;
}

export interface N8nFounderContentDispatchResult {
  ok: boolean;
  code:
    | 'DISPATCHED'
    | 'ORCHESTRATION_DISABLED'
    | 'ORCHESTRATION_NOT_CONFIGURED'
    | 'INVALID_ENVELOPE'
    | 'EXECUTION_CONTEXT_REQUIRED'
    | 'CADENCE_RESERVATION_FAILED'
    | 'SOURCE_PROJECT_UNRESOLVED'
    | 'IDEMPOTENCY_SCOPE_MISMATCH'
    | 'ACTION_ALREADY_RESERVED'
    | 'ACTION_RESERVATION_FAILED'
    | 'ACTION_AUDIT_INCOMPLETE'
    | 'UPSTREAM_REJECTED'
    | 'UPSTREAM_RECEIPT_INVALID'
    | 'UPSTREAM_UNREACHABLE';
  status: number;
  request: N8nFounderContentRequest | null;
  receipt: VerifiedN8nFounderContentReceipt | null;
  reasons: string[];
}

interface DispatchOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  executedBy?: string;
}

interface FounderContentExecutionRecord {
  id: string;
  mission_id: string | null;
  project_id: string;
  action_type: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export type FounderContentReservationResult =
  | { ok: true; executionId: string; projectId: string; reservationStartedAt: string }
  | {
      ok: false;
      code:
        | 'SOURCE_PROJECT_UNRESOLVED'
        | 'IDEMPOTENCY_SCOPE_MISMATCH'
        | 'ACTION_ALREADY_RESERVED'
        | 'ACTION_RESERVATION_FAILED';
      reason: string;
    };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validTimestamp(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

async function founderContentDb() {
  const { supabase } = await import('./supabaseClient.js');
  return supabase;
}

export function readN8nFounderContentConfig(
  env: NodeJS.ProcessEnv = process.env,
): N8nFounderContentConfig {
  const webhookUrl = text(env.N8N_FOUNDER_CONTENT_WEBHOOK_URL) || null;
  const bearerToken = text(env.N8N_FOUNDER_CONTENT_BEARER_TOKEN) || null;
  const enabled = text(env.N8N_FOUNDER_CONTENT_ENABLED).toLowerCase() === 'true';
  return {
    enabled,
    configured: Boolean(webhookUrl && bearerToken && validHttpsUrl(webhookUrl)),
    webhookUrl,
    bearerToken,
  };
}

export function validateN8nFounderContentEnvelope(
  envelope: FirstPartyFounderScheduleEnvelope,
): string[] {
  const reasons: string[] = [];
  const authority = envelope?.authority;
  const providerRequest = envelope?.provider_request;
  const source = envelope?.source;

  if (envelope?.version !== 1) reasons.push('envelope version must be 1');
  if (envelope?.lane !== 'first_party_founder_governed_schedule') {
    reasons.push('n8n founder-content orchestration accepts only first-party founder governed schedules');
  }
  if (envelope?.state !== 'scheduled_review_window') reasons.push('envelope state must be scheduled_review_window');
  if (text(envelope?.provider) !== 'buffer') reasons.push('current founder-content n8n lane supports the Buffer review-window provider only');
  if (!UUID.test(text(envelope?.content_id))) reasons.push('content_id must be a UUID');
  if (!text(envelope?.platform)) reasons.push('platform is required');
  if (!text(envelope?.channel)) reasons.push('channel is required');
  if (!text(envelope?.text) || text(envelope?.text).length > MAX_TEXT) reasons.push('validated public text is required and must be bounded');
  if (!OWNED_REPO.test(text(source?.repo))) reasons.push('source repo must be an owned jussray repository');
  if (!FULL_SHA.test(text(source?.commit_sha))) reasons.push('source commit must be an exact 40-character SHA');

  if (authority?.publish_allowed !== true || authority?.schedule_allowed !== true) {
    reasons.push('FCR must authorize scheduling before n8n orchestration');
  }
  if (authority?.authorization_receipt_verified !== true) reasons.push('FCR authorization receipt must be verified');
  if (authority?.authorization_mode !== 'exact-current-you') reasons.push('authorization_mode must be exact-current-you');
  if (authority?.standing_policy_applied !== false) reasons.push('standing policy may not authorize founder-progress publication');
  if (authority?.exact_current_you_approval_required !== true) reasons.push('exact Current You approval must be required');
  if (authority?.first_party_founder_content !== true) reasons.push('first-party founder-content marker is required');
  if (!HASH.test(text(authority?.founder_content_authorization_hash))) reasons.push('founder-content authorization hash is required');
  if (!HASH.test(text(authority?.founder_content_proposal_hash))) reasons.push('founder-content proposal hash is required');
  if (!HASH.test(text(authority?.public_payload_hash))) reasons.push('public payload hash is required');
  if (!text(authority?.current_you_intent_id)) reasons.push('Current You intent id is required');
  if (!Number.isInteger(authority?.current_you_intent_version) || Number(authority?.current_you_intent_version) < 1) {
    reasons.push('Current You intent version must be a positive integer');
  }

  if (providerRequest?.method !== 'schedule') reasons.push('provider request method must be schedule');
  if (providerRequest?.save_to_draft !== false) reasons.push('provider request must not silently downgrade to draft');
  if (providerRequest?.share_now_allowed !== false) reasons.push('share-now must remain forbidden');
  if (providerRequest?.external_write_included !== false) reasons.push('FCR schedule envelope must not claim a provider write already happened');
  if (!validTimestamp(text(providerRequest?.schedule_at))) reasons.push('schedule_at must be a valid timestamp');
  if (providerRequest?.review_deadline && !validTimestamp(text(providerRequest.review_deadline))) {
    reasons.push('review_deadline must be a valid timestamp when supplied');
  }

  return [...new Set(reasons)];
}

export function buildCanonicalFirstPartyFounderScheduleEnvelope(
  input: FirstPartyFounderDistributionInput,
): FirstPartyFounderScheduleEnvelope {
  const envelope = canonicalSocialDistribution.buildFirstPartyFounderScheduleEnvelope(input);
  const reasons = validateN8nFounderContentEnvelope(envelope);
  if (reasons.length > 0) {
    throw new Error(`N8N_FOUNDER_CONTENT_CANONICAL_ENVELOPE_REJECTED: ${reasons.join('; ')}`);
  }
  return envelope;
}

export function buildN8nFounderContentRequest(
  envelope: FirstPartyFounderScheduleEnvelope,
): N8nFounderContentRequest {
  const reasons = validateN8nFounderContentEnvelope(envelope);
  if (reasons.length > 0) throw new Error(`N8N_FOUNDER_CONTENT_REJECTED: ${reasons.join('; ')}`);

  const identity = {
    contentId: text(envelope.content_id),
    platform: text(envelope.platform).toLowerCase(),
    channel: text(envelope.channel),
    text: text(envelope.text),
    source: {
      repo: text(envelope.source.repo),
      commitSha: text(envelope.source.commit_sha).toLowerCase(),
    },
    fcrAuthorization: {
      mode: 'exact-current-you' as const,
      authorizationHash: text(envelope.authority.founder_content_authorization_hash).toLowerCase(),
      proposalHash: text(envelope.authority.founder_content_proposal_hash).toLowerCase(),
      publicPayloadHash: text(envelope.authority.public_payload_hash).toLowerCase(),
      currentYouIntentId: text(envelope.authority.current_you_intent_id),
      currentYouIntentVersion: Number(envelope.authority.current_you_intent_version),
    },
    providerRequest: {
      provider: text(envelope.provider),
      method: 'schedule' as const,
      scheduleAt: new Date(envelope.provider_request.schedule_at).toISOString(),
      reviewDeadline: envelope.provider_request.review_deadline
        ? new Date(envelope.provider_request.review_deadline).toISOString()
        : null,
      reviewWindowMinutes: Number.isFinite(envelope.provider_request.review_window_minutes)
        ? Number(envelope.provider_request.review_window_minutes)
        : null,
      shareNowAllowed: false as const,
    },
  };

  const orchestrationIdentity = {
    contract: N8N_FOUNDER_CONTENT_CONTRACT,
    ...identity,
  };

  return {
    contract: N8N_FOUNDER_CONTENT_CONTRACT,
    event: N8N_FOUNDER_CONTENT_EVENT,
    orchestrationId: `fcr-n8n-social-v1:${stableHash(orchestrationIdentity)}`,
    ...identity,
    authority: {
      orchestrate: true,
      requestProviderWrite: true,
      authorizePublication: false,
      changeCopy: false,
      markPublished: false,
      readPrivateEvidence: false,
    },
  };
}

export function verifyN8nFounderContentReceipt(
  request: N8nFounderContentRequest,
  input: N8nFounderContentReceiptInput,
): VerifiedN8nFounderContentReceipt {
  const reasons: string[] = [];
  const orchestrationId = text(input?.orchestrationId);
  const provider = text(input?.provider);
  const state = text(input?.state);
  const providerItemId = text(input?.providerItemId) || null;
  const providerRequestId = text(input?.providerRequestId) || null;

  if (orchestrationId !== request.orchestrationId) reasons.push('orchestration receipt does not match exact request');
  if (provider !== request.providerRequest.provider) reasons.push('orchestration receipt provider does not match request');
  if (!['accepted', 'scheduled'].includes(state)) reasons.push('n8n receipt state must be accepted or scheduled');
  if (state === 'scheduled' && !providerItemId) reasons.push('scheduled receipt requires providerItemId');
  if (input?.published === true) reasons.push('n8n may not assert final published truth');

  if (reasons.length > 0) throw new Error(`N8N_FOUNDER_CONTENT_RECEIPT_REJECTED: ${reasons.join('; ')}`);

  return {
    orchestrationId,
    provider,
    state: state as 'accepted' | 'scheduled',
    providerItemId,
    providerRequestId,
    truthState: 'provider_schedule_receipt_pending_readback',
    published: false,
    requiresProviderReadback: true,
  };
}

async function findFounderContentExecution(
  idempotencyKey: string,
): Promise<{ data: FounderContentExecutionRecord | null; error: { message: string } | null }> {
  const supabase = await founderContentDb();
  const { data, error } = await supabase
    .from('approval_executions')
    .select('id, mission_id, project_id, action_type, status')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return { data: data as FounderContentExecutionRecord | null, error };
}

export async function reserveN8nFounderContentExecution(
  request: N8nFounderContentRequest,
  executedBy: string,
): Promise<FounderContentReservationResult> {
  const actor = text(executedBy).toLowerCase();
  if (!actor) {
    return {
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
      reason: 'trusted founder execution identity is required',
    };
  }

  const supabase = await founderContentDb();
  const { data: projectRows, error: projectError } = await supabase
    .from('projects')
    .select('id, repo_identifier')
    .eq('repo_identifier', request.source.repo)
    .limit(2);

  if (projectError || !projectRows || projectRows.length !== 1) {
    return {
      ok: false,
      code: 'SOURCE_PROJECT_UNRESOLVED',
      reason: projectError
        ? `source project lookup failed: ${projectError.message}`
        : `source repository ${request.source.repo} must resolve to exactly one FCR project`,
    };
  }

  const projectId = String(projectRows[0].id);
  const expectedScope = {
    missionId: null,
    projectId,
    actionType: FOUNDER_CONTENT_ACTION,
  };
  const existing = await findFounderContentExecution(request.orchestrationId);
  if (existing.error) {
    return {
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
      reason: `founder-content reservation lookup failed: ${existing.error.message}`,
    };
  }
  if (existing.data) {
    if (!executionScopeMatches(existing.data, expectedScope)) {
      return {
        ok: false,
        code: 'IDEMPOTENCY_SCOPE_MISMATCH',
        reason: 'founder-content idempotency key already exists under a different execution scope',
      };
    }
    return {
      ok: false,
      code: 'ACTION_ALREADY_RESERVED',
      reason: `founder-content authorization is already ${existing.data.status}; exact approval will not be dispatched again`,
    };
  }

  const reservationStartedAt = new Date().toISOString();
  const { data: reservation, error: reservationError } = await supabase
    .from('approval_executions')
    .insert({
      mission_id: null,
      project_id: projectId,
      action_type: FOUNDER_CONTENT_ACTION,
      idempotency_key: request.orchestrationId,
      executed_by: actor,
      status: 'pending',
      request: {
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
      },
      result: { provider_write_attempted: false },
      success: null,
      started_at: reservationStartedAt,
    })
    .select('id, started_at')
    .single();

  if (reservationError || !reservation?.id || !text(reservation.started_at)) {
    const raced = await findFounderContentExecution(request.orchestrationId);
    if (!raced.error && raced.data) {
      if (!executionScopeMatches(raced.data, expectedScope)) {
        return {
          ok: false,
          code: 'IDEMPOTENCY_SCOPE_MISMATCH',
          reason: 'founder-content idempotency reservation raced with a different execution scope',
        };
      }
      return {
        ok: false,
        code: 'ACTION_ALREADY_RESERVED',
        reason: `founder-content authorization is already ${raced.data.status}; exact approval will not be dispatched again`,
      };
    }
    return {
      ok: false,
      code: 'ACTION_RESERVATION_FAILED',
      reason: reservationError?.message ?? 'founder-content reservation was not persisted',
    };
  }

  return {
    ok: true,
    executionId: String(reservation.id),
    projectId,
    reservationStartedAt: text(reservation.started_at),
  };
}

export async function acquireN8nFounderContentProviderWrite(
  executionId: string,
  reservationStartedAt: string,
): Promise<boolean> {
  const generation = text(reservationStartedAt);
  if (!generation) return false;

  try {
    const supabase = await founderContentDb();
    const { data, error } = await supabase
      .from('approval_executions')
      .update({
        result: {
          phase: 'provider_dispatch_started',
          provider_write_attempted: true,
        },
      })
      .eq('id', executionId)
      .eq('status', 'pending')
      .eq('started_at', generation)
      .eq('result->>provider_write_attempted', 'false')
      .select('id')
      .maybeSingle();

    return !error && String(data?.id ?? '') === executionId;
  } catch {
    return false;
  }
}

export async function finalizeN8nFounderContentExecution(
  executionId: string,
  receipt: VerifiedN8nFounderContentReceipt,
  reservationStartedAt: string,
): Promise<boolean> {
  const generation = text(reservationStartedAt);
  if (!generation) return false;

  const supabase = await founderContentDb();
  const { data, error } = await supabase
    .from('approval_executions')
    .update({
      status: 'succeeded',
      result: {
        provider_write_attempted: true,
        orchestrationId: receipt.orchestrationId,
        provider: receipt.provider,
        state: receipt.state,
        providerItemId: receipt.providerItemId,
        providerRequestId: receipt.providerRequestId,
        truthState: receipt.truthState,
        published: false,
        requiresProviderReadback: true,
      },
      success: true,
      executed_at: new Date().toISOString(),
    })
    .eq('id', executionId)
    .eq('status', 'pending')
    .eq('started_at', generation)
    .select('id')
    .maybeSingle();

  return !error && String(data?.id ?? '') === executionId;
}

export async function dispatchN8nFounderContent(
  input: FirstPartyFounderDistributionInput,
  options: DispatchOptions = {},
): Promise<N8nFounderContentDispatchResult> {
  let envelope: FirstPartyFounderScheduleEnvelope;
  let request: N8nFounderContentRequest;
  try {
    envelope = buildCanonicalFirstPartyFounderScheduleEnvelope(input);
    request = buildN8nFounderContentRequest(envelope);
  } catch (error) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      status: 400,
      request: null,
      receipt: null,
      reasons: [error instanceof Error ? error.message : 'invalid canonical founder-content input'],
    };
  }

  const config = readN8nFounderContentConfig(options.env ?? process.env);
  if (!config.enabled) {
    return { ok: false, code: 'ORCHESTRATION_DISABLED', status: 503, request, receipt: null, reasons: ['n8n founder-content orchestration is disabled'] };
  }
  if (!config.configured || !config.webhookUrl || !config.bearerToken) {
    return { ok: false, code: 'ORCHESTRATION_NOT_CONFIGURED', status: 503, request, receipt: null, reasons: ['n8n founder-content webhook and bearer token must be configured'] };
  }

  const executedBy = text(options.executedBy).toLowerCase();
  if (!executedBy) {
    return {
      ok: false,
      code: 'EXECUTION_CONTEXT_REQUIRED',
      status: 500,
      request,
      receipt: null,
      reasons: ['server-authenticated founder identity is required before external orchestration'],
    };
  }

  try {
    const approvalExpiresAt = text(
      input.approval && typeof input.approval === 'object'
        ? (input.approval as Record<string, unknown>).expires_at
        : '',
    );
    const cadence = await reserveFounderContentCadence({
      provider: envelope.provider,
      channel: envelope.channel,
      contentId: envelope.content_id,
      requestedScheduleAt: envelope.provider_request.schedule_at,
      approvalExpiresAt,
    });
    envelope = applyFounderContentCadenceSchedule(envelope, cadence);
    request = buildN8nFounderContentRequest(envelope);
  } catch (error) {
    return {
      ok: false,
      code: 'CADENCE_RESERVATION_FAILED',
      status: 503,
      request,
      receipt: null,
      reasons: [
        error instanceof Error ? error.message : 'founder-content cadence reservation failed',
        'no external founder-content orchestration was attempted',
      ],
    };
  }

  const reservation = await reserveN8nFounderContentExecution(request, executedBy);
  if (!reservation.ok) {
    const status = reservation.code === 'ACTION_RESERVATION_FAILED' ? 503 : 409;
    return {
      ok: false,
      code: reservation.code,
      status,
      request,
      receipt: null,
      reasons: [reservation.reason],
    };
  }

  const providerWriteAcquired = await acquireN8nFounderContentProviderWrite(
    reservation.executionId,
    reservation.reservationStartedAt,
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
    const response = await (options.fetchImpl ?? fetch)(config.webhookUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': request.orchestrationId,
        'X-FCR-Orchestration-Contract': N8N_FOUNDER_CONTENT_CONTRACT,
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
      const receipt = verifyN8nFounderContentReceipt(request, body);
      const finalized = await finalizeN8nFounderContentExecution(
        reservation.executionId,
        receipt,
        reservation.reservationStartedAt,
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
}
