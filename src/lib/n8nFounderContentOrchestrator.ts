import { createHash } from 'node:crypto';

export const N8N_FOUNDER_CONTENT_CONTRACT = 'fcr/n8n-founder-content-orchestration@v1' as const;
export const N8N_FOUNDER_CONTENT_EVENT = 'founder-content.schedule.requested' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNED_REPO = /^jussray\/[A-Za-z0-9._-]+$/;
const MAX_TEXT = 5000;

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
}

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

export function buildN8nFounderContentRequest(
  envelope: FirstPartyFounderScheduleEnvelope,
): N8nFounderContentRequest {
  const reasons = validateN8nFounderContentEnvelope(envelope);
  if (reasons.length > 0) throw new Error(`N8N_FOUNDER_CONTENT_REJECTED: ${reasons.join('; ')}`);

  const identity = {
    contract: N8N_FOUNDER_CONTENT_CONTRACT,
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

  return {
    contract: N8N_FOUNDER_CONTENT_CONTRACT,
    event: N8N_FOUNDER_CONTENT_EVENT,
    orchestrationId: `fcr-n8n-social-v1:${stableHash(identity)}`,
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

export async function dispatchN8nFounderContent(
  envelope: FirstPartyFounderScheduleEnvelope,
  options: DispatchOptions = {},
): Promise<N8nFounderContentDispatchResult> {
  const config = readN8nFounderContentConfig(options.env ?? process.env);
  if (!config.enabled) {
    return { ok: false, code: 'ORCHESTRATION_DISABLED', status: 503, request: null, receipt: null, reasons: ['n8n founder-content orchestration is disabled'] };
  }
  if (!config.configured || !config.webhookUrl || !config.bearerToken) {
    return { ok: false, code: 'ORCHESTRATION_NOT_CONFIGURED', status: 503, request: null, receipt: null, reasons: ['n8n founder-content webhook and bearer token must be configured'] };
  }

  let request: N8nFounderContentRequest;
  try {
    request = buildN8nFounderContentRequest(envelope);
  } catch (error) {
    return { ok: false, code: 'INVALID_ENVELOPE', status: 400, request: null, receipt: null, reasons: [error instanceof Error ? error.message : 'invalid founder-content envelope'] };
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
      return { ok: false, code: 'UPSTREAM_REJECTED', status: 502, request, receipt: null, reasons: [`n8n rejected founder-content orchestration with HTTP ${response.status}`] };
    }

    try {
      const receipt = verifyN8nFounderContentReceipt(request, body);
      return { ok: true, code: 'DISPATCHED', status: 202, request, receipt, reasons: [] };
    } catch (error) {
      return { ok: false, code: 'UPSTREAM_RECEIPT_INVALID', status: 502, request, receipt: null, reasons: [error instanceof Error ? error.message : 'invalid n8n founder-content receipt'] };
    }
  } catch {
    return { ok: false, code: 'UPSTREAM_UNREACHABLE', status: 502, request, receipt: null, reasons: ['n8n founder-content webhook was unreachable'] };
  }
}
