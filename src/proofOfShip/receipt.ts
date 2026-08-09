const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SOURCE_REPO = /^jussray\/[A-Za-z0-9._-]{1,100}$/;
const SAFE_TOKEN = /^[A-Za-z0-9._:-]{1,200}$/;
const SAFE_PROVIDER = /^[A-Za-z0-9._-]{1,80}$/;

export type ProofOfShipReceipt = {
  receiptId: string;
  source: 'zapier';
  sourceRepo: string;
  exactCommitSha: string;
  idempotencyKey: string;
  linkedinBaselineRef: string;
  linkedinRisingFloorReady: true;
  linkedinGrowthHypothesis: string;
  linkedin24hGate: string;
  linkedin48hGate: string;
  linkedinNextMutation: string;
  linkedinDraftSha256: string;
  bufferTerminalAction: 'schedule';
  bufferScheduleId: string;
  scheduledAt: string;
  bufferPublicationStatus: 'published';
  bufferPostId: string;
  livePostUrl: string;
  publishedAt: string;
  smsNotificationStatus: 'delivered';
  smsProvider: string;
  smsMessageId: string;
  smsDeliveredAt: string;
  occurredAt: string;
};

export class ProofOfShipReceiptError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProofOfShipReceiptError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new ProofOfShipReceiptError(`invalid_${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized)) {
    throw new ProofOfShipReceiptError(`invalid_${field}`);
  }
  return normalized;
}

function canonicalIsoTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 40) {
    throw new ProofOfShipReceiptError(`invalid_${field}`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ProofOfShipReceiptError(`invalid_${field}`);
  }
  return parsed.toISOString();
}

function canonicalHttpsUrl(value: unknown, field: string): string {
  const normalized = boundedText(value, field, 1000);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ProofOfShipReceiptError(`invalid_${field}`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new ProofOfShipReceiptError(`invalid_${field}`);
  }
  return parsed.toString();
}

export function normalizeProofOfShipReceiptId(value: unknown): string {
  if (typeof value !== 'string' || !RECEIPT_ID.test(value)) {
    throw new ProofOfShipReceiptError('invalid_receipt_id');
  }
  return value.toLowerCase();
}

export function validateProofOfShipReceipt(input: unknown): ProofOfShipReceipt {
  if (!isRecord(input)) throw new ProofOfShipReceiptError('invalid_body');

  const allowedKeys = new Set([
    'receiptId',
    'source',
    'sourceRepo',
    'exactCommitSha',
    'idempotencyKey',
    'linkedinBaselineRef',
    'linkedinRisingFloorReady',
    'linkedinGrowthHypothesis',
    'linkedin24hGate',
    'linkedin48hGate',
    'linkedinNextMutation',
    'linkedinDraftSha256',
    'bufferTerminalAction',
    'bufferScheduleId',
    'scheduledAt',
    'bufferPublicationStatus',
    'bufferPostId',
    'livePostUrl',
    'publishedAt',
    'smsNotificationStatus',
    'smsProvider',
    'smsMessageId',
    'smsDeliveredAt',
    'occurredAt',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new ProofOfShipReceiptError('unknown_or_private_field');
    }
  }

  const receiptId = normalizeProofOfShipReceiptId(input.receiptId);
  if (input.source !== 'zapier') throw new ProofOfShipReceiptError('invalid_source');
  if (typeof input.sourceRepo !== 'string' || !SOURCE_REPO.test(input.sourceRepo)) {
    throw new ProofOfShipReceiptError('invalid_source_repo');
  }
  if (typeof input.exactCommitSha !== 'string' || !COMMIT_SHA.test(input.exactCommitSha)) {
    throw new ProofOfShipReceiptError('invalid_exact_commit_sha');
  }

  const exactCommitSha = input.exactCommitSha.toLowerCase();
  const expectedIdempotencyKey = `${input.sourceRepo}:${exactCommitSha}`;
  if (input.idempotencyKey !== expectedIdempotencyKey) {
    throw new ProofOfShipReceiptError('invalid_idempotency_key');
  }

  const linkedinBaselineRef = boundedText(input.linkedinBaselineRef, 'linkedin_baseline_ref', 200);
  if (!linkedinBaselineRef.startsWith('linkedin-export:')) {
    throw new ProofOfShipReceiptError('invalid_linkedin_baseline_ref');
  }
  if (input.linkedinRisingFloorReady !== true) {
    throw new ProofOfShipReceiptError('linkedin_rising_floor_not_ready');
  }
  if (typeof input.linkedinDraftSha256 !== 'string' || !SHA256.test(input.linkedinDraftSha256)) {
    throw new ProofOfShipReceiptError('invalid_linkedin_draft_sha256');
  }
  if (input.bufferTerminalAction !== 'schedule') {
    throw new ProofOfShipReceiptError('invalid_buffer_terminal_action');
  }
  if (typeof input.bufferScheduleId !== 'string' || !SAFE_TOKEN.test(input.bufferScheduleId)) {
    throw new ProofOfShipReceiptError('invalid_buffer_schedule_id');
  }
  if (input.bufferPublicationStatus !== 'published') {
    throw new ProofOfShipReceiptError('invalid_buffer_publication_status');
  }
  if (typeof input.bufferPostId !== 'string' || !SAFE_TOKEN.test(input.bufferPostId)) {
    throw new ProofOfShipReceiptError('invalid_buffer_post_id');
  }
  if (input.smsNotificationStatus !== 'delivered') {
    throw new ProofOfShipReceiptError('invalid_sms_notification_status');
  }
  if (typeof input.smsProvider !== 'string' || !SAFE_PROVIDER.test(input.smsProvider)) {
    throw new ProofOfShipReceiptError('invalid_sms_provider');
  }
  if (typeof input.smsMessageId !== 'string' || !SAFE_TOKEN.test(input.smsMessageId)) {
    throw new ProofOfShipReceiptError('invalid_sms_message_id');
  }

  const scheduledAt = canonicalIsoTimestamp(input.scheduledAt, 'scheduled_at');
  const publishedAt = canonicalIsoTimestamp(input.publishedAt, 'published_at');
  const smsDeliveredAt = canonicalIsoTimestamp(input.smsDeliveredAt, 'sms_delivered_at');
  const occurredAt = canonicalIsoTimestamp(input.occurredAt, 'occurred_at');

  if (Date.parse(publishedAt) < Date.parse(scheduledAt)) {
    throw new ProofOfShipReceiptError('invalid_publication_timeline');
  }
  if (Date.parse(smsDeliveredAt) < Date.parse(publishedAt)) {
    throw new ProofOfShipReceiptError('invalid_sms_timeline');
  }
  if (Date.parse(occurredAt) < Date.parse(smsDeliveredAt)) {
    throw new ProofOfShipReceiptError('invalid_receipt_timeline');
  }

  return {
    receiptId,
    source: 'zapier',
    sourceRepo: input.sourceRepo,
    exactCommitSha,
    idempotencyKey: expectedIdempotencyKey,
    linkedinBaselineRef,
    linkedinRisingFloorReady: true,
    linkedinGrowthHypothesis: boundedText(input.linkedinGrowthHypothesis, 'linkedin_growth_hypothesis', 1200),
    linkedin24hGate: boundedText(input.linkedin24hGate, 'linkedin_24h_gate', 600),
    linkedin48hGate: boundedText(input.linkedin48hGate, 'linkedin_48h_gate', 600),
    linkedinNextMutation: boundedText(input.linkedinNextMutation, 'linkedin_next_mutation', 1200),
    linkedinDraftSha256: input.linkedinDraftSha256.toLowerCase(),
    bufferTerminalAction: 'schedule',
    bufferScheduleId: input.bufferScheduleId,
    scheduledAt,
    bufferPublicationStatus: 'published',
    bufferPostId: input.bufferPostId,
    livePostUrl: canonicalHttpsUrl(input.livePostUrl, 'live_post_url'),
    publishedAt,
    smsNotificationStatus: 'delivered',
    smsProvider: input.smsProvider,
    smsMessageId: input.smsMessageId,
    smsDeliveredAt,
    occurredAt,
  };
}
