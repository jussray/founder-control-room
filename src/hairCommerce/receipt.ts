const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

export const HAIR_COMMERCE_EVENTS = [
  'paid_order_recorded',
  'vendor_review_required',
  'vendor_groups_ready',
  'owner_approved',
  'fulfillment_queued',
  'fulfillment_dispatched',
  'tracking_received',
  'completed',
  'exception',
] as const;

export type HairCommerceEvent = (typeof HAIR_COMMERCE_EVENTS)[number];

export type HairCommerceReceipt = {
  receiptId: string;
  sourceRepo: 'jussray/jbh-private';
  orderRefHash: string;
  event: HairCommerceEvent;
  groupCount: number;
  unresolvedCount: number;
  occurredAt: string;
  exactCommitSha: string;
  evidenceUrl?: string;
};

export class HairCommerceReceiptError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'HairCommerceReceiptError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1000) {
    throw new HairCommerceReceiptError(`invalid_${field}`);
  }
  return value as number;
}

function githubEvidenceUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 500) {
    throw new HairCommerceReceiptError('invalid_evidence_url');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HairCommerceReceiptError('invalid_evidence_url');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new HairCommerceReceiptError('invalid_evidence_url');
  }
  return parsed.toString();
}

export function validateHairCommerceReceipt(input: unknown): HairCommerceReceipt {
  if (!isRecord(input)) throw new HairCommerceReceiptError('invalid_body');

  const allowedKeys = new Set([
    'receiptId',
    'sourceRepo',
    'orderRefHash',
    'event',
    'groupCount',
    'unresolvedCount',
    'occurredAt',
    'exactCommitSha',
    'evidenceUrl',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new HairCommerceReceiptError('unknown_or_private_field');
    }
  }

  if (typeof input.receiptId !== 'string' || !RECEIPT_ID.test(input.receiptId)) {
    throw new HairCommerceReceiptError('invalid_receipt_id');
  }
  if (input.sourceRepo !== 'jussray/jbh-private') {
    throw new HairCommerceReceiptError('invalid_source_repo');
  }
  if (typeof input.orderRefHash !== 'string' || !SHA256.test(input.orderRefHash)) {
    throw new HairCommerceReceiptError('invalid_order_ref_hash');
  }
  if (
    typeof input.event !== 'string' ||
    !HAIR_COMMERCE_EVENTS.includes(input.event as HairCommerceEvent)
  ) {
    throw new HairCommerceReceiptError('invalid_event');
  }
  if (
    typeof input.exactCommitSha !== 'string' ||
    !COMMIT_SHA.test(input.exactCommitSha)
  ) {
    throw new HairCommerceReceiptError('invalid_exact_commit_sha');
  }
  if (typeof input.occurredAt !== 'string' || input.occurredAt.length > 40) {
    throw new HairCommerceReceiptError('invalid_occurred_at');
  }
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== input.occurredAt) {
    throw new HairCommerceReceiptError('invalid_occurred_at');
  }

  return {
    receiptId: input.receiptId.toLowerCase(),
    sourceRepo: 'jussray/jbh-private',
    orderRefHash: input.orderRefHash.toLowerCase(),
    event: input.event as HairCommerceEvent,
    groupCount: boundedInteger(input.groupCount, 'group_count'),
    unresolvedCount: boundedInteger(input.unresolvedCount, 'unresolved_count'),
    occurredAt: occurredAt.toISOString(),
    exactCommitSha: input.exactCommitSha.toLowerCase(),
    evidenceUrl: githubEvidenceUrl(input.evidenceUrl),
  };
}
