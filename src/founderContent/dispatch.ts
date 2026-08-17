import { createHash, randomUUID } from 'node:crypto';
import { supabase } from '../lib/supabaseClient.js';
import { executionScopeMatches } from '../lib/idempotencyScope.js';
import {
  authorizeFounderContentPublication,
  type FounderContentAuthorization,
} from './authorization.js';

const HTTPS_URL = /^https:\/\//i;
const SHA256 = /^[0-9a-f]{64}$/i;
const PROVIDER_RESPONSE_LIMIT_BYTES = 16 * 1024;
const DISPATCH_TIMEOUT_MS = 15_000;
const ACTION_TYPE = 'schedule_founder_content';
const SCHEDULE_POLICY_ID = 'buffer-20-minute-review-v1';
const REVIEW_WINDOW_MINUTES = 20;

interface ExecutionRecord {
  id: string;
  mission_id: string | null;
  project_id: string;
  action_type: string;
  status: 'pending' | 'succeeded' | 'failed';
  result: Record<string, unknown> | null;
  success: boolean | null;
}

interface SourceProject {
  id: string;
  slug: string;
  repo_identifier: string | null;
}

export interface FounderContentDispatchInput {
  proposal: unknown;
  approval: unknown;
  proofUrl: string;
  channel: string;
  contentField: string;
  linkedinStrategy?: {
    baselineRef: string;
    growthHypothesis: string;
    gate24h: string;
    gate48h: string;
    nextMutation: string;
  };
}

export interface FounderContentDispatchResult {
  ok: boolean;
  idempotent: boolean;
  executionId: string;
  authorizationHash: string;
  providerDispatchAccepted: boolean;
  providerExecutionProven: false;
  scheduledAt: string;
  reviewDeadline: string;
  reviewWindowMinutes: 20;
}

export class FounderContentDispatchError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'FounderContentDispatchError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function validateDistributionInput(
  input: FounderContentDispatchInput,
  authorization: FounderContentAuthorization,
): void {
  if (!HTTPS_URL.test(input.proofUrl)) {
    throw new FounderContentDispatchError('INVALID_PROOF_URL', 400, 'proofUrl must be HTTPS');
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(input.channel)) {
    throw new FounderContentDispatchError('INVALID_CHANNEL', 400, 'channel is invalid');
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(input.contentField)) {
    throw new FounderContentDispatchError('INVALID_CONTENT_FIELD', 400, 'contentField is invalid');
  }
  const expectedPlatform = input.channel === 'juss_rayy_linkedin'
    ? 'linkedin'
    : input.channel.endsWith('_facebook')
      ? 'facebook'
      : authorization.content.platform;
  if (expectedPlatform !== authorization.content.platform) {
    throw new FounderContentDispatchError(
      'CHANNEL_PLATFORM_MISMATCH',
      409,
      'Selected channel does not match the exact authorized platform',
    );
  }
  if (!authorization.channels.includes(authorization.content.platform)) {
    throw new FounderContentDispatchError('CHANNEL_NOT_AUTHORIZED', 403, 'Platform is not included in Current You approval');
  }

  if (authorization.content.platform === 'linkedin') {
    if (input.channel !== 'juss_rayy_linkedin' || input.contentField !== 'linkedin_draft') {
      throw new FounderContentDispatchError(
        'LINKEDIN_DESTINATION_MISMATCH',
        409,
        'LinkedIn founder content must use juss_rayy_linkedin + linkedin_draft',
      );
    }
    const strategy = input.linkedinStrategy;
    if (!strategy) {
      throw new FounderContentDispatchError('LINKEDIN_STRATEGY_REQUIRED', 422, 'Verified LinkedIn strategy context is required');
    }
    const fields = [
      strategy.baselineRef,
      strategy.growthHypothesis,
      strategy.gate24h,
      strategy.gate48h,
      strategy.nextMutation,
    ];
    if (fields.some(value => typeof value !== 'string' || value.trim().length < 20)) {
      throw new FounderContentDispatchError('LINKEDIN_STRATEGY_INCOMPLETE', 422, 'LinkedIn rising-floor strategy is incomplete');
    }
  }
}

async function findExecution(idempotencyKey: string): Promise<ExecutionRecord | null> {
  const { data, error } = await supabase
    .from('approval_executions')
    .select('id,mission_id,project_id,action_type,status,result,success')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) {
    throw new FounderContentDispatchError(
      'EXECUTION_LOOKUP_FAILED',
      500,
      'Unable to inspect founder-content idempotency ledger',
    );
  }
  return data as ExecutionRecord | null;
}

async function sourceProject(sourceRepo: string): Promise<SourceProject> {
  const { data, error } = await supabase
    .from('projects')
    .select('id,slug,repo_identifier')
    .eq('repo_identifier', sourceRepo)
    .maybeSingle();
  if (error) {
    throw new FounderContentDispatchError('PROJECT_LOOKUP_FAILED', 500, 'Unable to resolve source project');
  }
  if (!data) {
    throw new FounderContentDispatchError(
      'SOURCE_PROJECT_NOT_GOVERNED',
      403,
      'Source repository is not registered as a governed FCR project',
    );
  }
  return data as SourceProject;
}

function successfulReplay(
  existing: ExecutionRecord,
  authorization: FounderContentAuthorization,
): FounderContentDispatchResult {
  const result = existing.result ?? {};
  const scheduledAt = typeof result.scheduledAt === 'string' ? result.scheduledAt : '';
  const reviewDeadline = typeof result.reviewDeadline === 'string' ? result.reviewDeadline : '';
  const authorizationHash = typeof result.authorizationHash === 'string'
    ? result.authorizationHash
    : '';
  if (
    authorizationHash !== authorization.authorization_hash
    || !scheduledAt
    || reviewDeadline !== scheduledAt
  ) {
    throw new FounderContentDispatchError(
      'IDEMPOTENT_RESULT_INVALID',
      409,
      'Stored founder-content execution cannot be safely replayed',
    );
  }
  return {
    ok: true,
    idempotent: true,
    executionId: existing.id,
    authorizationHash,
    providerDispatchAccepted: true,
    providerExecutionProven: false,
    scheduledAt,
    reviewDeadline,
    reviewWindowMinutes: 20,
  };
}

export async function reserveAndDispatchFounderContent(
  input: FounderContentDispatchInput,
  options: {
    now?: () => number;
    fetchImpl?: typeof fetch;
    hookUrl?: string;
    executedBy: string;
  },
): Promise<FounderContentDispatchResult> {
  const nowMs = options.now?.() ?? Date.now();
  const authorization = authorizeFounderContentPublication({
    proposal: input.proposal,
    approval: input.approval,
    now: new Date(nowMs),
  });
  validateDistributionInput(input, authorization);

  const project = await sourceProject(authorization.source.repo);
  const idempotencyKey = `founder-content:${authorization.authorization_hash}`;
  const expectedScope = {
    missionId: null,
    projectId: project.id,
    actionType: ACTION_TYPE,
  };
  const existing = await findExecution(idempotencyKey);
  if (existing) {
    if (!executionScopeMatches(existing, expectedScope)) {
      throw new FounderContentDispatchError(
        'IDEMPOTENCY_SCOPE_MISMATCH',
        409,
        'Founder-content authorization hash is bound to a different execution scope',
      );
    }
    if (existing.status === 'succeeded') return successfulReplay(existing, authorization);
    if (existing.status === 'pending') {
      throw new FounderContentDispatchError(
        'FOUNDER_CONTENT_ALREADY_RESERVED',
        409,
        'This founder-content authorization is already reserved or may have dispatched',
      );
    }
    throw new FounderContentDispatchError(
      'FOUNDER_CONTENT_PREVIOUSLY_FAILED',
      409,
      'This exact authorization already failed; Current You must approve a new authorization before retrying',
    );
  }

  const invocationId = randomUUID();
  const batchId = randomUUID();
  const scheduledAt = iso(nowMs + REVIEW_WINDOW_MINUTES * 60 * 1000);
  const reviewDeadline = scheduledAt;
  const founderApprovalId = `current-you:${authorization.authorization_hash}`;
  const strategy = input.linkedinStrategy;
  const payload = {
    version: 1,
    event_type: 'first_party_founder_content_schedule',
    idempotency_key: idempotencyKey,
    execution_authorization_hash: authorization.authorization_hash,
    proposal_hash: authorization.proposal_hash,
    public_payload_hash: authorization.public_payload_hash,
    source_repo: authorization.source.repo,
    source_commit_sha: authorization.source.commit_sha,
    proof_url: input.proofUrl,
    post_text: authorization.content.text,
    platform: authorization.content.platform,
    channel: input.channel,
    content_field: input.contentField,
    publish_allowed: true,
    destination_mode: 'schedule',
    invocation_id: invocationId,
    batch_id: batchId,
    batch_size: 1,
    batch_index: 1,
    founder_approval_id: founderApprovalId,
    authorization_mode: 'exact-current-you',
    founder_content_authorization_hash: authorization.authorization_hash,
    current_you_intent_id: authorization.current_you.intent_id,
    current_you_intent_version: authorization.current_you.intent_version,
    current_you_observed_at: authorization.current_you.observed_at,
    schedule_policy_id: SCHEDULE_POLICY_ID,
    notification_mode: 'gmail_campaign_digest',
    generated_at: iso(nowMs),
    scheduled_at: scheduledAt,
    review_deadline: reviewDeadline,
    review_window_minutes: REVIEW_WINDOW_MINUTES,
    share_now_allowed: false,
    buffer_method: 'schedule',
    buffer_save_to_draft: false,
    buffer_api_sharing_mode: 'customScheduled',
    provider_execution_receipt_required: true,
    ...(strategy ? {
      linkedin_rising_floor_ready: true,
      linkedin_baseline_ref: strategy.baselineRef.trim(),
      linkedin_growth_hypothesis: strategy.growthHypothesis.trim(),
      linkedin_24h_gate: strategy.gate24h.trim(),
      linkedin_48h_gate: strategy.gate48h.trim(),
      linkedin_next_mutation: strategy.nextMutation.trim(),
    } : {}),
  };
  const body = JSON.stringify(payload);
  const requestHash = sha256(body);

  const { data: reservation, error: reservationError } = await supabase
    .from('approval_executions')
    .insert({
      mission_id: null,
      project_id: project.id,
      action_type: ACTION_TYPE,
      idempotency_key: idempotencyKey,
      executed_by: options.executedBy,
      status: 'pending',
      request: {
        authorization_hash: authorization.authorization_hash,
        proposal_hash: authorization.proposal_hash,
        public_payload_hash: authorization.public_payload_hash,
        source_repo: authorization.source.repo,
        source_commit_sha: authorization.source.commit_sha,
        platform: authorization.content.platform,
        channel: input.channel,
        content_field: input.contentField,
        provider_request_hash: requestHash,
      },
      result: {},
      success: null,
      started_at: iso(nowMs),
    })
    .select('id')
    .single();

  if (reservationError || !reservation) {
    const raced = await findExecution(idempotencyKey);
    if (raced && executionScopeMatches(raced, expectedScope)) {
      if (raced.status === 'succeeded') return successfulReplay(raced, authorization);
      throw new FounderContentDispatchError(
        'FOUNDER_CONTENT_ALREADY_RESERVED',
        409,
        'Another request reserved this exact founder-content authorization',
      );
    }
    throw new FounderContentDispatchError(
      'FOUNDER_CONTENT_RESERVATION_FAILED',
      500,
      'Unable to reserve founder-content publication; no provider dispatch was attempted',
    );
  }

  const executionId = String(reservation.id);
  const hookUrl = options.hookUrl ?? process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL?.trim() ?? '';
  if (!HTTPS_URL.test(hookUrl)) {
    await supabase.from('approval_executions').update({
      status: 'failed',
      success: false,
      result: { code: 'PROVIDER_HOOK_NOT_CONFIGURED' },
      executed_at: iso(Date.now()),
    }).eq('id', executionId);
    throw new FounderContentDispatchError(
      'PROVIDER_HOOK_NOT_CONFIGURED',
      503,
      'Private Zapier founder-signal hook is not configured',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  let status: number | null = null;
  let responseText = '';
  try {
    const response = await (options.fetchImpl ?? fetch)(hookUrl, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        'x-founder-content-idempotency-key': idempotencyKey,
        'x-founder-content-execution-id': executionId,
      },
      body,
      signal: controller.signal,
    });
    status = response.status;
    responseText = await response.text();
    if (Buffer.byteLength(responseText, 'utf8') > PROVIDER_RESPONSE_LIMIT_BYTES) {
      throw new FounderContentDispatchError(
        'PROVIDER_RESPONSE_TOO_LARGE',
        502,
        'Zapier dispatch response exceeded the retained receipt limit',
      );
    }
    if (!response.ok) {
      throw new FounderContentDispatchError(
        'PROVIDER_DISPATCH_REJECTED',
        502,
        `Zapier dispatch rejected the request with HTTP ${response.status}`,
      );
    }
  } catch (error) {
    const responseHash = responseText ? sha256(responseText) : null;
    await supabase.from('approval_executions').update({
      status: 'failed',
      success: false,
      result: {
        code: error instanceof FounderContentDispatchError ? error.code : 'PROVIDER_DISPATCH_AMBIGUOUS',
        provider_http_status: status,
        provider_response_hash: responseHash,
        provider_execution_proven: false,
      },
      executed_at: iso(Date.now()),
    }).eq('id', executionId);
    if (error instanceof FounderContentDispatchError) throw error;
    throw new FounderContentDispatchError(
      'PROVIDER_DISPATCH_AMBIGUOUS',
      502,
      'Zapier dispatch outcome is ambiguous; do not retry this authorization',
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseHash = sha256(responseText || `http:${status}`);
  const result = {
    authorizationHash: authorization.authorization_hash,
    providerDispatchAccepted: true,
    providerExecutionProven: false,
    providerHttpStatus: status,
    providerResponseHash: responseHash,
    scheduledAt,
    reviewDeadline,
    reviewWindowMinutes: REVIEW_WINDOW_MINUTES,
  };
  const { error: finalizeError } = await supabase.from('approval_executions').update({
    status: 'succeeded',
    success: true,
    result,
    executed_at: iso(Date.now()),
  }).eq('id', executionId).eq('status', 'pending');
  if (finalizeError) {
    throw new FounderContentDispatchError(
      'FOUNDER_CONTENT_AUDIT_INCOMPLETE',
      502,
      'Zapier accepted the dispatch but FCR could not finalize its ledger; do not retry automatically',
    );
  }

  return {
    ok: true,
    idempotent: false,
    executionId,
    authorizationHash: authorization.authorization_hash,
    providerDispatchAccepted: true,
    providerExecutionProven: false,
    scheduledAt,
    reviewDeadline,
    reviewWindowMinutes: 20,
  };
}

export function isFounderContentAuthorizationHash(value: string): boolean {
  return SHA256.test(value);
}
