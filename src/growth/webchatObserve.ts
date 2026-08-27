import { createHash } from 'node:crypto';
import type { CanonicalMessageEnvelope } from '../types/growthInbox.js';

export const WEBCHAT_OBSERVE_CONTRACT = 'fcr-growth-webchat-observe@v1' as const;

const MAX_TEXT_LENGTH = 2_000;
const FINGERPRINT_PATTERN = /^[a-z0-9][a-z0-9._:-]{7,127}$/i;
const SAFE_PROJECT_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/i;

const FORBIDDEN_KEYS = new Set([
  'journal',
  'journalText',
  'voiceNote',
  'voiceTranscript',
  'privateChat',
  'safetyEvent',
  'emotionalState',
  'healthData',
  'parentVisibleContent',
  'accessToken',
  'refreshToken',
  'serviceRoleKey',
  'password',
]);

export interface FirstPartyWebchatObservationInput {
  projectId: string;
  brandId: string;
  entryFlowFingerprintId: string;
  campaignFingerprintId?: string;
  contentFingerprintId?: string;
  conversationId: string;
  anonymousVisitorId: string;
  text?: string;
  purpose: 'support' | 'updates' | 'marketing';
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface FirstPartyWebchatObservation {
  contract: typeof WEBCHAT_OBSERVE_CONTRACT;
  entryFlowFingerprintId: string;
  campaignFingerprintId?: string;
  contentFingerprintId?: string;
  envelope: CanonicalMessageEnvelope;
  sanitizedMetadata: Record<string, string | number | boolean | null>;
  canDispatch: false;
}

function assertIdentifier(label: string, value: string, pattern: RegExp): void {
  if (!pattern.test(value)) {
    throw new Error(`${label} is missing or malformed`);
  }
}

function assertIsoTimestamp(value: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error('occurredAt must be an exact ISO-8601 timestamp');
  }
}

function normalizeText(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new Error(`text exceeds ${MAX_TEXT_LENGTH} characters`);
  }
  return normalized;
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  if (!metadata) return sanitized;

  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`forbidden webchat metadata key: ${key}`);
    }
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      sanitized[key] = typeof value === 'string' ? value.slice(0, 500) : value;
    }
  }

  return sanitized;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function observeFirstPartyWebchat(
  input: FirstPartyWebchatObservationInput,
): FirstPartyWebchatObservation {
  assertIdentifier('projectId', input.projectId, SAFE_PROJECT_PATTERN);
  assertIdentifier('brandId', input.brandId, SAFE_PROJECT_PATTERN);
  assertIdentifier('entryFlowFingerprintId', input.entryFlowFingerprintId, FINGERPRINT_PATTERN);
  assertIdentifier('conversationId', input.conversationId, FINGERPRINT_PATTERN);
  assertIdentifier('anonymousVisitorId', input.anonymousVisitorId, FINGERPRINT_PATTERN);
  assertIsoTimestamp(input.occurredAt);

  if (input.campaignFingerprintId) {
    assertIdentifier('campaignFingerprintId', input.campaignFingerprintId, FINGERPRINT_PATTERN);
  }
  if (input.contentFingerprintId) {
    assertIdentifier('contentFingerprintId', input.contentFingerprintId, FINGERPRINT_PATTERN);
  }

  const sanitizedText = normalizeText(input.text);
  const sanitizedMetadata = sanitizeMetadata(input.metadata);
  const visitorHash = digest(`${input.projectId}:${input.anonymousVisitorId}`);
  const eventHash = digest([
    WEBCHAT_OBSERVE_CONTRACT,
    input.projectId,
    input.brandId,
    input.entryFlowFingerprintId,
    input.conversationId,
    visitorHash,
    input.occurredAt,
    sanitizedText ?? '',
  ].join('|'));

  return {
    contract: WEBCHAT_OBSERVE_CONTRACT,
    entryFlowFingerprintId: input.entryFlowFingerprintId,
    campaignFingerprintId: input.campaignFingerprintId,
    contentFingerprintId: input.contentFingerprintId,
    sanitizedMetadata,
    canDispatch: false,
    envelope: {
      providerEventId: eventHash,
      idempotencyKey: `webchat:${eventHash}`,
      projectId: input.projectId,
      brandId: input.brandId,
      channel: 'webchat',
      providerAccountId: 'first-party-webchat',
      providerConversationId: input.conversationId,
      providerUserId: `anon:${visitorHash}`,
      direction: 'inbound',
      contentType: sanitizedText ? 'text' : 'event',
      sanitizedText,
      receivedAt: input.occurredAt,
      providerTimestamp: input.occurredAt,
      signatureVerified: false,
      automationMode: 'observe_only',
      purpose: input.purpose,
      sensitivityFlags: [],
    },
  };
}
