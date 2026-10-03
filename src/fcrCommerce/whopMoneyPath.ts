import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const FCR_WHOP_MONEY_PATH_CONTRACT =
  'founder-control-room/whop-money-path@v1' as const;
export const FCR_WHOP_PAYMENT_EVENT = 'payment.succeeded' as const;
export const FCR_WHOP_CURRENCY = 'USD' as const;
export const FCR_WHOP_MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

export interface WhopWebhookHeaders {
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
}

export interface FcrWhopPaidReceipt {
  contract: typeof FCR_WHOP_MONEY_PATH_CONTRACT;
  provider: 'whop';
  webhookId: string;
  eventId: string;
  accountFingerprint: string;
  paymentRefHash: string;
  event: 'payment_collected';
  revenueState: 'payment_collected';
  collectedValueCents: number;
  currency: typeof FCR_WHOP_CURRENCY;
  occurredAt: string;
  apiVersion: 'v1';
  apiVersionDate: string | null;
}

export class FcrWhopMoneyPathError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FcrWhopMoneyPathError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseUsdCents(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const amount = stringValue(value.amount);
  const currency = stringValue(value.currency)?.toLowerCase();
  const decimals = value.decimals;

  if (!amount || currency !== 'usd' || decimals !== 2) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;

  const [whole, fraction = ''] = amount.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_000
    ? cents
    : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function constantTimeBase64Equal(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function signatureCandidates(value: string): string[] {
  return value
    .split(/\s+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .flatMap((candidate) => {
      const separator = candidate.indexOf(',');
      if (separator < 0) return [];
      const version = candidate.slice(0, separator);
      const signature = candidate.slice(separator + 1);
      return version === 'v1' && signature ? [signature] : [];
    });
}

/**
 * Verify Whop's Standard Webhooks signature without introducing an SDK
 * dependency. Whop signs:
 *   {webhook-id}.{webhook-timestamp}.{raw body}
 * using HMAC-SHA256 and the ws_ signing secret, then base64 encodes the digest.
 */
export function verifyWhopWebhookSignature(input: {
  rawBody: Buffer;
  headers: WhopWebhookHeaders;
  secret: string;
  nowMs?: number;
}): boolean {
  const { rawBody, headers, secret, nowMs = Date.now() } = input;

  if (!secret.startsWith('ws_')) return false;
  if (!headers.webhookId || !headers.webhookSignature) return false;
  if (!/^\d{1,20}$/.test(headers.webhookTimestamp)) return false;

  const timestampSeconds = Number(headers.webhookTimestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;

  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > FCR_WHOP_MAX_WEBHOOK_AGE_SECONDS) {
    return false;
  }

  const signed = Buffer.concat([
    Buffer.from(`${headers.webhookId}.${headers.webhookTimestamp}.`, 'utf8'),
    rawBody,
  ]);

  const expected = createHmac('sha256', secret).update(signed).digest('base64');
  return signatureCandidates(headers.webhookSignature)
    .some((candidate) => constantTimeBase64Equal(candidate, expected));
}

export function buildFcrWhopPaidReceipt(input: {
  rawPayload: unknown;
  webhookId: string;
  hashSalt: string;
}): FcrWhopPaidReceipt {
  if (!input.hashSalt) throw new FcrWhopMoneyPathError('missing_hash_salt');
  if (!/^msg_[A-Za-z0-9_-]+$/.test(input.webhookId)) {
    throw new FcrWhopMoneyPathError('invalid_webhook_id');
  }
  if (!isRecord(input.rawPayload)) throw new FcrWhopMoneyPathError('invalid_body');

  const body = input.rawPayload;
  if (body.api_version !== 'v1') throw new FcrWhopMoneyPathError('invalid_api_version');
  if (body.type !== FCR_WHOP_PAYMENT_EVENT) {
    throw new FcrWhopMoneyPathError('unsupported_event');
  }
  if (body.id !== input.webhookId) throw new FcrWhopMoneyPathError('webhook_id_mismatch');

  const eventTimestamp = stringValue(body.timestamp);
  if (!eventTimestamp) throw new FcrWhopMoneyPathError('invalid_occurred_at');
  const occurredAt = new Date(eventTimestamp);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== eventTimestamp) {
    throw new FcrWhopMoneyPathError('invalid_occurred_at');
  }

  const accountId = stringValue(body.account_id ?? body.company_id);
  if (!accountId || !/^biz_[A-Za-z0-9_-]+$/.test(accountId)) {
    throw new FcrWhopMoneyPathError('invalid_account_id');
  }

  const data = isRecord(body.data) ? body.data : null;
  if (!data) throw new FcrWhopMoneyPathError('invalid_payment');

  const paymentId = stringValue(data.id);
  if (!paymentId || !/^pay_[A-Za-z0-9_-]+$/.test(paymentId)) {
    throw new FcrWhopMoneyPathError('invalid_payment_id');
  }
  if (data.status !== 'paid' || data.substatus !== 'succeeded') {
    throw new FcrWhopMoneyPathError('payment_not_succeeded');
  }

  const totalCents = parseUsdCents(data.total);
  if (totalCents === null) throw new FcrWhopMoneyPathError('invalid_total');

  const apiVersionDate = body.api_version_date === null
    ? null
    : stringValue(body.api_version_date);
  if (
    apiVersionDate !== null
    && !/^\d{4}-\d{2}-\d{2}$/.test(apiVersionDate)
  ) {
    throw new FcrWhopMoneyPathError('invalid_api_version_date');
  }

  return {
    contract: FCR_WHOP_MONEY_PATH_CONTRACT,
    provider: 'whop',
    webhookId: input.webhookId,
    eventId: paymentId,
    accountFingerprint: sha256(`whop-account:\0${accountId}`),
    paymentRefHash: sha256(`${input.hashSalt}:whop-payment:\0${paymentId}`),
    event: 'payment_collected',
    revenueState: 'payment_collected',
    collectedValueCents: totalCents,
    currency: FCR_WHOP_CURRENCY,
    occurredAt: occurredAt.toISOString(),
    apiVersion: 'v1',
    apiVersionDate,
  };
}
