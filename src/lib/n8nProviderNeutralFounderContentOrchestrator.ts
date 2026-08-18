import { createHash } from 'node:crypto';
import {
  applyFounderContentCadenceSchedule,
  reserveFounderContentCadence,
} from './founderContentCadence.js';
import {
  N8N_FOUNDER_CONTENT_CONTRACT,
  N8N_FOUNDER_CONTENT_EVENT,
  buildCanonicalFirstPartyFounderScheduleEnvelope,
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

export const N8N_FOUNDER_CONTENT_PROVIDER_ROUTES = {
  buffer: [
    'linkedin',
    'facebook',
    'instagram',
    'threads',
    'x',
    'tiktok',
    'youtube_shorts',
    'pinterest',
    'bluesky',
    'mastodon',
    'google_business',
  ],
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

const DEFAULT_PROVIDER: N8nFounderContentProvider = 'buffer';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requestedProvider(input: FirstPartyFounderDistributionInput): string {
  return text(input.n8n_provider).toLowerCase() || DEFAULT_PROVIDER;
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
  const canonical = buildCanonicalFirstPartyFounderScheduleEnvelope(input);
  const provider = resolveN8nFounderContentProvider(input, text(canonical.platform).toLowerCase());
  const envelope = {
    ...canonical,
    provider,
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
  const providerRequest = {
    ...base.providerRequest,
    provider: text(envelope.provider).toLowerCase(),
  };
  const identity = {
    contentId: base.contentId,
    platform: base.platform,
    channel: base.channel,
    text: base.text,
    source: base.source,
    fcrAuthorization: base.fcrAuthorization,
    providerRequest,
  };

  return {
    ...base,
    orchestrationId: `fcr-n8n-social-v1:${stableHash({
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      ...identity,
    })}`,
    ...identity,
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

  const config = readN8nFounderContentConfig(options.env ?? process.env);
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
      provider: envelope.provider,
      channel: envelope.channel,
      contentId: envelope.content_id,
      requestedScheduleAt: envelope.provider_request.schedule_at,
    });
    envelope = applyFounderContentCadenceSchedule(envelope, cadence);
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
