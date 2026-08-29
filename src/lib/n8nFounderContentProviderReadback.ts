import { createHash } from 'node:crypto';
import type {
  N8nFounderContentRequest,
  VerifiedN8nFounderContentReceipt,
} from './n8nFounderContentOrchestrator.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const READBACK_FIELDS = new Set([
  'orchestrationId',
  'provider',
  'providerItemId',
  'providerRequestId',
  'state',
  'providerNativeState',
  'platform',
  'channel',
  'sourceRepo',
  'exactCommitSha',
  'scheduledAt',
  'observedAt',
  'published',
  'sanitized',
  'readbackSource',
]);

export interface N8nFounderContentProviderReadbackInput {
  orchestrationId?: unknown;
  provider?: unknown;
  providerItemId?: unknown;
  providerRequestId?: unknown;
  state?: unknown;
  providerNativeState?: unknown;
  platform?: unknown;
  channel?: unknown;
  sourceRepo?: unknown;
  exactCommitSha?: unknown;
  scheduledAt?: unknown;
  observedAt?: unknown;
  published?: unknown;
  sanitized?: unknown;
  readbackSource?: unknown;
}

export interface VerifiedN8nFounderContentProviderReadback {
  orchestrationId: string;
  provider: string;
  providerItemId: string;
  providerRequestId: string | null;
  state: 'scheduled';
  providerNativeState: string;
  platform: string;
  channel: string;
  sourceRepo: string;
  exactCommitSha: string;
  scheduledAt: string;
  observedAt: string;
  truthState: 'provider_schedule_verified';
  published: false;
  requiresProviderReadback: false;
  sanitized: true;
  readbackSource: 'provider-native-api';
  readbackHash: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isoTimestamp(value: unknown): string | null {
  const candidate = text(value);
  const parsed = Date.parse(candidate);
  return candidate && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertSanitizedShape(input: N8nFounderContentProviderReadbackInput): void {
  const extra = Object.keys(input as Record<string, unknown>)
    .filter((key) => !READBACK_FIELDS.has(key))
    .sort();
  if (extra.length > 0) {
    throw new Error(`N8N_FOUNDER_CONTENT_PROVIDER_READBACK_REJECTED: sanitized provider readback contains unsupported fields: ${extra.join(', ')}`);
  }
  if (input.sanitized !== true) {
    throw new Error('N8N_FOUNDER_CONTENT_PROVIDER_READBACK_REJECTED: provider readback must be explicitly sanitized');
  }
  if (text(input.readbackSource) !== 'provider-native-api') {
    throw new Error('N8N_FOUNDER_CONTENT_PROVIDER_READBACK_REJECTED: readback must originate from the provider-native API');
  }
}

/**
 * Upgrades an n8n scheduling acknowledgement into verified provider truth.
 *
 * The provider adapter owns credentials and native API shape. FCR accepts only a
 * strict sanitized projection of that independent readback and binds it back to
 * the exact orchestration request. This function never authorizes publication
 * and never accepts n8n itself as provider truth.
 */
export function verifyN8nFounderContentProviderReadback(
  request: N8nFounderContentRequest,
  receipt: VerifiedN8nFounderContentReceipt,
  input: N8nFounderContentProviderReadbackInput,
): VerifiedN8nFounderContentProviderReadback {
  assertSanitizedShape(input);

  const reasons: string[] = [];
  const orchestrationId = text(input.orchestrationId);
  const provider = text(input.provider).toLowerCase();
  const providerItemId = text(input.providerItemId);
  const providerRequestId = text(input.providerRequestId) || null;
  const state = text(input.state).toLowerCase();
  const providerNativeState = text(input.providerNativeState);
  const platform = text(input.platform).toLowerCase();
  const channel = text(input.channel);
  const sourceRepo = text(input.sourceRepo);
  const exactCommitSha = text(input.exactCommitSha).toLowerCase();
  const scheduledAt = isoTimestamp(input.scheduledAt);
  const observedAt = isoTimestamp(input.observedAt);

  if (receipt.state !== 'scheduled' || !receipt.providerItemId) {
    reasons.push('provider readback requires a scheduled n8n receipt with providerItemId');
  }
  if (receipt.requiresProviderReadback !== true || receipt.truthState !== 'provider_schedule_receipt_pending_readback') {
    reasons.push('provider readback may only close a pending provider-readback receipt');
  }
  if (receipt.published !== false) reasons.push('n8n receipt may not assert publication truth');

  if (orchestrationId !== request.orchestrationId || orchestrationId !== receipt.orchestrationId) {
    reasons.push('provider readback orchestrationId does not match the exact request and receipt');
  }
  if (provider !== request.providerRequest.provider || provider !== receipt.provider) {
    reasons.push('provider readback provider does not match the exact request and receipt');
  }
  if (!providerItemId || providerItemId !== receipt.providerItemId) {
    reasons.push('provider readback item id does not match the scheduled provider item');
  }
  if (receipt.providerRequestId && providerRequestId !== receipt.providerRequestId) {
    reasons.push('provider readback request id does not match the n8n provider request');
  }
  if (state !== 'scheduled') reasons.push('provider readback normalized state must be scheduled');
  if (!providerNativeState) reasons.push('provider readback must retain a nonempty native provider state');
  if (platform !== request.platform) reasons.push('provider readback platform does not match the exact request');
  if (channel !== request.channel) reasons.push('provider readback channel does not match the exact request');
  if (sourceRepo !== request.source.repo) reasons.push('provider readback source repo does not match the exact request');
  if (!FULL_SHA.test(exactCommitSha) || exactCommitSha !== request.source.commitSha.toLowerCase()) {
    reasons.push('provider readback exact commit SHA does not match the exact request');
  }
  if (!scheduledAt || scheduledAt !== new Date(request.providerRequest.scheduleAt).toISOString()) {
    reasons.push('provider readback scheduledAt does not match the exact requested schedule');
  }
  if (!observedAt) reasons.push('provider readback observedAt must be a valid timestamp');
  if (input.published !== false) reasons.push('provider readback may not silently elevate scheduled state to published');

  if (reasons.length > 0) {
    throw new Error(`N8N_FOUNDER_CONTENT_PROVIDER_READBACK_REJECTED: ${[...new Set(reasons)].join('; ')}`);
  }

  const verified = {
    orchestrationId,
    provider,
    providerItemId,
    providerRequestId,
    state: 'scheduled' as const,
    providerNativeState,
    platform,
    channel,
    sourceRepo,
    exactCommitSha,
    scheduledAt: scheduledAt!,
    observedAt: observedAt!,
    truthState: 'provider_schedule_verified' as const,
    published: false as const,
    requiresProviderReadback: false as const,
    sanitized: true as const,
    readbackSource: 'provider-native-api' as const,
  };

  return {
    ...verified,
    readbackHash: stableHash(verified),
  };
}
