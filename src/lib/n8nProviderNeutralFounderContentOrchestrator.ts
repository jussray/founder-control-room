import { createHash } from 'node:crypto';
import {
  applyFounderContentCadenceSchedule,
  reserveFounderContentCadence,
} from './founderContentCadence.js';
import { temporalClaimTextDomainErrors } from '../governance/temporalClaimTruth.js';
import {
  N8N_FOUNDER_CONTENT_CONTRACT,
  N8N_FOUNDER_CONTENT_EVENT,
  buildN8nFounderContentRequest,
  finalizeN8nFounderContentExecution,
  readN8nFounderContentConfig,
  reserveN8nFounderContentExecution,
  validateN8nFounderContentEnvelope,
  verifyN8nFounderContentReceipt,
  type FirstPartyFounderDistributionInput,
  type FirstPartyFounderScheduleEnvelope,
  type N8nFounderContentDispatchResult,
  type N8nFounderContentReceiptInput,
  type N8nFounderContentRequest,
  type VerifiedN8nFounderContentReceipt,
} from './n8nFounderContentOrchestrator.js';
// @ts-expect-error -- canonical founder-content authorization is CommonJS and remains the single Current You authority implementation.
import founderContentAuthorizationContract from '../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';

export const N8N_FOUNDER_CONTENT_PROVIDER_ROUTES = {
  buffer: ['linkedin', 'facebook'],
  meta: ['facebook', 'instagram', 'threads'],
  tiktok: ['tiktok'],
  x: ['x'],
  youtube: ['youtube_shorts'],
  pinterest: ['pinterest'],
  bluesky: ['bluesky'],
  mastodon: ['mastodon'],
  google_business: ['google_business'],
} as const;

export type N8nFounderContentProvider = keyof typeof N8N_FOUNDER_CONTENT_PROVIDER_ROUTES;

export interface N8nFounderContentProviderConfig {
  enabledProviders: N8nFounderContentProvider[];
  invalidProviders: string[];
}

interface FounderContentAuthorization {
  state: string;
  proposal_hash: string;
  public_payload_hash: string;
  source: { repo: string; commit_sha: string };
  content: { platform: string; text: string };
  current_you: {
    intent_id: string;
    intent_version: number;
  };
  authority: {
    exact_current_you_approval_required: boolean;
    share_now_allowed: boolean;
    execution_mode: string;
  };
  channels: readonly string[];
  expires_at: string;
  approval_id: string;
  authorization_hash: string;
}

interface FounderContentAuthorizationContract {
  authorizeFounderContentPublication(input: {
    proposal?: unknown;
    approval?: unknown;
    now?: unknown;
  }): FounderContentAuthorization;
}

const canonicalFounderAuthorization = founderContentAuthorizationContract as FounderContentAuthorizationContract;
const DEFAULT_PROVIDER: N8nFounderContentProvider = 'buffer';
const NATIVE_REVIEW_WINDOW_MINUTES = 20;
const NATIVE_REVIEW_WINDOW_MS = NATIVE_REVIEW_WINDOW_MINUTES * 60 * 1000;
const PROVIDER_NEUTRAL_EXECUTION_IDENTITY = 'fcr/n8n-founder-content-execution-identity@v2' as const;
const PROVIDER_NEUTRAL_CADENCE_PROVIDER = 'n8n' as const;
const BUFFER_FOUNDER_CHANNELS: Readonly<Record<string, string>> = Object.freeze({
  linkedin: 'juss_rayy_linkedin',
  facebook: 'juss_and_co_facebook',
});

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicUuid(value: unknown): string {
  const hex = stableHash(value).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20, 32)}`;
}

function requestedProvider(input: FirstPartyFounderDistributionInput): string {
  return text(input.n8n_provider).toLowerCase() || DEFAULT_PROVIDER;
}

function exactAuthorization(input: FirstPartyFounderDistributionInput): FounderContentAuthorization {
  return canonicalFounderAuthorization.authorizeFounderContentPublication({
    proposal: input.proposal,
    approval: input.approval,
    now: input.now,
  });
}

function assertCallerDoesNotContradictAuthorization(
  input: FirstPartyFounderDistributionInput,
  authorization: FounderContentAuthorization,
): void {
  const conflicts: string[] = [];
  const suppliedRepo = text(input.source_repo);
  const suppliedSha = text(input.source_commit_sha).toLowerCase();
  const suppliedPlatform = text(input.platform).toLowerCase();
  const suppliedText = text(input.text);

  if (suppliedRepo && suppliedRepo !== authorization.source.repo) {
    conflicts.push('source_repo conflicts with exact founder authorization');
  }
  if (suppliedSha && suppliedSha !== authorization.source.commit_sha) {
    conflicts.push('source_commit_sha conflicts with exact founder authorization');
  }
  if (suppliedPlatform && suppliedPlatform !== authorization.content.platform) {
    conflicts.push('platform conflicts with exact founder authorization');
  }
  if (suppliedText && suppliedText !== authorization.content.text) {
    conflicts.push('text conflicts with exact founder authorization');
  }

  if (conflicts.length > 0) {
    throw new Error(`N8N_FOUNDER_CONTENT_AUTHORITY_CONFLICT: ${conflicts.join('; ')}`);
  }
}

function assertHistoricalDeferredText(label: string, value: unknown, reasons: string[]): void {
  reasons.push(...temporalClaimTextDomainErrors({
    label,
    text: text(value),
    temporalClass: 'historical_version',
  }));
}

function assertDeferredProviderClaimsAreHistoricallyDurable(
  input: FirstPartyFounderDistributionInput,
  authorization: FounderContentAuthorization,
): void {
  const proposal = input.proposal && typeof input.proposal === 'object'
    ? input.proposal as Record<string, unknown>
    : {};
  const publicPayload = proposal.public_payload && typeof proposal.public_payload === 'object'
    ? proposal.public_payload as Record<string, unknown>
    : {};
  const claims = Array.isArray(publicPayload.public_claims) ? publicPayload.public_claims : [];
  const reasons: string[] = [];

  assertHistoricalDeferredText('approved deferred copy', authorization.content.text, reasons);

  if (claims.length === 0) {
    reasons.push('scheduled provider routes require canonical public claims');
  }

  claims.forEach((value, index) => {
    const claim = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const claimId = text(claim.claim_id).toLowerCase() || `index-${index}`;
    const temporalClass = text(claim.temporal_class).toLowerCase();
    const temporalVersion = text(claim.temporal_version).toLowerCase();
    const claimText = text(claim.text);

    if (temporalClass !== 'historical_version') {
      reasons.push(`claim ${claimId} is ${temporalClass || 'unclassified'}; deferred publication only accepts historical_version claims`);
    }
    if (temporalVersion !== authorization.source.commit_sha) {
      reasons.push(`claim ${claimId} must bind historical truth to the exact authorized source commit`);
    }
    assertHistoricalDeferredText(`historical claim ${claimId}`, claimText, reasons);
  });

  if (reasons.length > 0) {
    throw new Error(
      `N8N_FOUNDER_CONTENT_TEMPORAL_REVALIDATION_REQUIRED: ${reasons.join('; ')}; current repository, runtime, and metric claims require execution-time FCR revalidation rather than a deferred provider queue`,
    );
  }
}

function nativeScheduleAt(input: FirstPartyFounderDistributionInput, authorization: FounderContentAuthorization): string {
  const nowMs = Date.parse(text(input.now));
  const expiresMs = Date.parse(authorization.expires_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) {
    throw new Error('N8N_FOUNDER_CONTENT_NATIVE_SCHEDULE_REJECTED: authorization time boundary is invalid');
  }
  const scheduledMs = nowMs + NATIVE_REVIEW_WINDOW_MS;
  if (scheduledMs >= expiresMs) {
    throw new Error('N8N_FOUNDER_CONTENT_NATIVE_SCHEDULE_REJECTED: exact founder approval expires before the required 20-minute review window completes');
  }
  return new Date(scheduledMs).toISOString();
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

function providerChannel(provider: N8nFounderContentProvider, platform: string): string {
  if (provider === DEFAULT_PROVIDER) {
    const channel = BUFFER_FOUNDER_CHANNELS[platform];
    if (!channel) {
      throw new Error(`N8N_FOUNDER_CONTENT_NATIVE_SCHEDULE_REJECTED: no server-owned Buffer founder channel is configured for ${platform}`);
    }
    return channel;
  }
  return `fcr_${platform}`;
}

function providerNeutralExecutionId(request: N8nFounderContentRequest): string {
  return `fcr-n8n-social-v2:${stableHash({
    contract: PROVIDER_NEUTRAL_EXECUTION_IDENTITY,
    platform: request.platform,
    source: request.source,
    authorizationHash: request.fcrAuthorization.authorizationHash,
    proposalHash: request.fcrAuthorization.proposalHash,
    publicPayloadHash: request.fcrAuthorization.publicPayloadHash,
    currentYouIntentId: request.fcrAuthorization.currentYouIntentId,
    currentYouIntentVersion: request.fcrAuthorization.currentYouIntentVersion,
  })}`;
}

export function readN8nFounderContentProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): N8nFounderContentProviderConfig {
  const raw = text(env.N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS);
  if (!raw) {
    return { enabledProviders: [DEFAULT_PROVIDER], invalidProviders: [] };
  }

  const requested = [...new Set(raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean))];
  const invalidProviders = requested.filter((provider) => !(provider in N8N_FOUNDER_CONTENT_PROVIDER_ROUTES));
  const enabledProviders = requested.filter(
    (provider): provider is N8nFounderContentProvider => provider in N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
  );

  return { enabledProviders, invalidProviders };
}

export function providerSupportsFounderContentPlatform(provider: string, platform: string): boolean {
  const routes = N8N_FOUNDER_CONTENT_PROVIDER_ROUTES[provider as N8nFounderContentProvider];
  return Boolean(routes?.includes(platform as never));
}

export function resolveN8nFounderContentProvider(
  input: FirstPartyFounderDistributionInput,
  platform: string,
): N8nFounderContentProvider {
  const provider = requestedProvider(input);
  if (!(provider in N8N_FOUNDER_CONTENT_PROVIDER_ROUTES)) {
    throw new Error(`N8N_FOUNDER_CONTENT_PROVIDER_REJECTED: unsupported provider ${provider || '(empty)'}`);
  }
  if (!providerSupportsFounderContentPlatform(provider, platform)) {
    throw new Error(`N8N_FOUNDER_CONTENT_PROVIDER_REJECTED: provider ${provider} does not support platform ${platform}`);
  }
  return provider as N8nFounderContentProvider;
}

export function validateProviderNeutralN8nFounderContentEnvelope(
  envelope: FirstPartyFounderScheduleEnvelope,
): string[] {
  const provider = text(envelope?.provider).toLowerCase();
  const platform = text(envelope?.platform).toLowerCase();
  const reasons = validateN8nFounderContentEnvelope({
    ...envelope,
    provider: DEFAULT_PROVIDER,
  });

  if (!(provider in N8N_FOUNDER_CONTENT_PROVIDER_ROUTES)) {
    reasons.push(`unsupported n8n founder-content provider ${provider || '(empty)'}`);
  } else if (!providerSupportsFounderContentPlatform(provider, platform)) {
    reasons.push(`provider ${provider} does not support platform ${platform}`);
  }

  return [...new Set(reasons)];
}

export function buildProviderNeutralN8nFounderContentEnvelope(
  input: FirstPartyFounderDistributionInput,
): FirstPartyFounderScheduleEnvelope {
  const authorization = exactAuthorization(input);
  assertCallerDoesNotContradictAuthorization(input, authorization);
  assertDeferredProviderClaimsAreHistoricallyDurable(input, authorization);

  const platform = text(authorization.content.platform).toLowerCase();
  const provider = resolveN8nFounderContentProvider(input, platform);
  const contentId = deterministicUuid({
    authorizationHash: authorization.authorization_hash,
    proposalHash: authorization.proposal_hash,
    publicPayloadHash: authorization.public_payload_hash,
    platform,
  });

  if (authorization.state !== 'authorized-for-scheduled-review') {
    throw new Error('N8N_FOUNDER_CONTENT_NATIVE_SCHEDULE_REJECTED: exact founder authorization is not valid for scheduled review');
  }
  if (authorization.authority.exact_current_you_approval_required !== true) {
    throw new Error('N8N_FOUNDER_CONTENT_NATIVE_SCHEDULE_REJECTED: exact Current You approval is required');
  }
  if (authorization.authority.share_now_allowed !== false || authorization.authority.execution_mode !== 'schedule_review_window') {
    throw new Error('N8N_FOUNDER_CONTENT_NATIVE_SCHEDULE_REJECTED: native provider route must remain schedule-review-only');
  }
  if (!authorization.channels.includes(platform)) {
    throw new Error('N8N_FOUNDER_CONTENT_NATIVE_SCHEDULE_REJECTED: exact founder approval does not include the authorized platform');
  }

  const scheduleAt = nativeScheduleAt(input, authorization);
  const envelope: FirstPartyFounderScheduleEnvelope = {
    version: 1,
    lane: 'first_party_founder_governed_schedule',
    provider,
    state: 'scheduled_review_window',
    content_id: contentId,
    platform,
    channel: providerChannel(provider, platform),
    text: authorization.content.text,
    source: {
      repo: authorization.source.repo,
      commit_sha: authorization.source.commit_sha,
    },
    authority: {
      publish_allowed: true,
      schedule_allowed: true,
      standing_policy_applied: false,
      authorization_mode: 'exact-current-you',
      authorization_receipt_verified: true,
      exact_current_you_approval_required: true,
      first_party_founder_content: true,
      founder_content_authorization_hash: authorization.authorization_hash,
      founder_content_proposal_hash: authorization.proposal_hash,
      public_payload_hash: authorization.public_payload_hash,
      current_you_intent_id: authorization.current_you.intent_id,
      current_you_intent_version: authorization.current_you.intent_version,
    },
    provider_request: {
      method: 'schedule',
      save_to_draft: false,
      schedule_at: scheduleAt,
      review_deadline: scheduleAt,
      review_window_minutes: NATIVE_REVIEW_WINDOW_MINUTES,
      share_now_allowed: false,
      external_write_included: false,
    },
  };

  const reasons = validateProviderNeutralN8nFounderContentEnvelope(envelope);
  if (reasons.length > 0) {
    throw new Error(`N8N_FOUNDER_CONTENT_PROVIDER_ENVELOPE_REJECTED: ${reasons.join('; ')}`);
  }
  return envelope;
}

export function buildProviderNeutralN8nFounderContentRequest(
  envelope: FirstPartyFounderScheduleEnvelope,
): N8nFounderContentRequest {
  const reasons = validateProviderNeutralN8nFounderContentEnvelope(envelope);
  if (reasons.length > 0) {
    throw new Error(`N8N_FOUNDER_CONTENT_PROVIDER_REQUEST_REJECTED: ${reasons.join('; ')}`);
  }

  const base = buildN8nFounderContentRequest({
    ...envelope,
    provider: DEFAULT_PROVIDER,
  });
  const request: N8nFounderContentRequest = {
    ...base,
    providerRequest: {
      ...base.providerRequest,
      provider: text(envelope.provider).toLowerCase(),
    },
  };

  return {
    ...request,
    orchestrationId: providerNeutralExecutionId(request),
  };
}

export function verifyProviderNeutralN8nFounderContentReceipt(
  request: N8nFounderContentRequest,
  input: N8nFounderContentReceiptInput,
): VerifiedN8nFounderContentReceipt {
  const provider = text(input?.provider).toLowerCase();
  if (provider !== request.providerRequest.provider) {
    throw new Error('N8N_FOUNDER_CONTENT_RECEIPT_REJECTED: orchestration receipt provider does not match request');
  }

  const shadowRequest: N8nFounderContentRequest = {
    ...request,
    providerRequest: {
      ...request.providerRequest,
      provider: DEFAULT_PROVIDER,
    },
  };
  const shadow = verifyN8nFounderContentReceipt(shadowRequest, {
    ...input,
    provider: DEFAULT_PROVIDER,
  });

  return {
    ...shadow,
    provider,
  };
}

export async function dispatchProviderNeutralN8nFounderContent(
  input: FirstPartyFounderDistributionInput,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    executedBy?: string;
  } = {},
): Promise<N8nFounderContentDispatchResult> {
  let envelope: FirstPartyFounderScheduleEnvelope;
  let request: N8nFounderContentRequest;

  try {
    envelope = buildProviderNeutralN8nFounderContentEnvelope(input);
    request = buildProviderNeutralN8nFounderContentRequest(envelope);
  } catch (error) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      status: 400,
      request: null,
      receipt: null,
      reasons: [error instanceof Error ? error.message : 'invalid provider-neutral founder-content input'],
    };
  }

  const env = options.env ?? process.env;
  const config = readN8nFounderContentConfig(env);
  if (!config.enabled) {
    return {
      ok: false,
      code: 'ORCHESTRATION_DISABLED',
      status: 503,
      request,
      receipt: null,
      reasons: ['n8n founder-content orchestration is disabled'],
    };
  }
  if (!config.configured || !config.webhookUrl || !config.bearerToken) {
    return {
      ok: false,
      code: 'ORCHESTRATION_NOT_CONFIGURED',
      status: 503,
      request,
      receipt: null,
      reasons: ['n8n founder-content webhook and bearer token must be configured'],
    };
  }

  const providerConfig = readN8nFounderContentProviderConfig(env);
  if (providerConfig.invalidProviders.length > 0) {
    return {
      ok: false,
      code: 'ORCHESTRATION_NOT_CONFIGURED',
      status: 503,
      request,
      receipt: null,
      reasons: [`n8n founder-content provider allowlist contains unsupported values: ${providerConfig.invalidProviders.join(', ')}`],
    };
  }
  if (!providerConfig.enabledProviders.includes(request.providerRequest.provider as N8nFounderContentProvider)) {
    return {
      ok: false,
      code: 'ORCHESTRATION_NOT_CONFIGURED',
      status: 503,
      request,
      receipt: null,
      reasons: [
        `n8n provider ${request.providerRequest.provider} is contract-capable but not runtime-enabled`,
        'set N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS only after the matching n8n provider adapter is configured and verified',
      ],
    };
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
    const cadence = await reserveFounderContentCadence({
      provider: PROVIDER_NEUTRAL_CADENCE_PROVIDER,
      channel: request.platform,
      contentId: envelope.content_id,
      requestedScheduleAt: envelope.provider_request.schedule_at,
    });
    const cadenceProjection = applyFounderContentCadenceSchedule({
      provider: PROVIDER_NEUTRAL_CADENCE_PROVIDER,
      channel: request.platform,
      content_id: envelope.content_id,
      provider_request: { schedule_at: envelope.provider_request.schedule_at },
    }, cadence);
    const authorization = exactAuthorization(input);
    assertScheduleBeforeApprovalExpiry(
      cadenceProjection.provider_request.schedule_at,
      authorization.expires_at,
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
    return {
      ok: false,
      code: reservation.code,
      status: reservation.code === 'ACTION_RESERVATION_FAILED' ? 503 : 409,
      request,
      receipt: null,
      reasons: [reservation.reason],
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
      const finalized = await finalizeN8nFounderContentExecution(reservation.executionId, receipt);
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

export { N8N_FOUNDER_CONTENT_CONTRACT, N8N_FOUNDER_CONTENT_EVENT };