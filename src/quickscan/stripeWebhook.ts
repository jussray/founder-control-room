/**
 * QuickScan Stripe Payment Link verification.
 *
 * FCR stores a Stripe-hosted payment link and consumes verified payment
 * status; it never implements checkout itself and never calls the Stripe
 * API to move money. Everything here is pure and network-free: signature
 * verification and event parsing only, so it is fully testable without a
 * live Stripe account.
 *
 * Correlating an inbound event to a prospect relies on Stripe's own
 * `client_reference_id` mechanism: appending
 * `?client_reference_id=<prospectId>` to a Payment Link URL carries that id
 * through checkout into the resulting Checkout Session, which this module
 * reads back out of the webhook payload.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifiedStripeCheckoutEvent {
  eventId: string;
  sessionId: string;
  paymentIntentId: string | null;
  clientReferenceId: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentStatus: string;
  paymentLinkId: string | null;
}

const DEFAULT_TOLERANCE_SECONDS = 300;

interface ParsedSignatureHeader {
  timestamp: number;
  signatures: string[];
}

function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key === 't' && value) timestamp = Number(value);
    else if (key === 'v1' && value) signatures.push(value);
  }

  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * Verifies Stripe's `Stripe-Signature` header against the exact raw request
 * bytes, following Stripe's documented scheme: HMAC-SHA256 of
 * `${timestamp}.${rawBody}` under the endpoint secret, compared in constant
 * time, with a bounded replay window on the signed timestamp.
 */
export function verifyStripeWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
  options: { toleranceSeconds?: number; now?: () => number } = {},
): boolean {
  if (!signatureHeader || !secret) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret)
    .update(`${parsed.timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return parsed.signatures.some((signature) => {
    if (!/^[0-9a-f]+$/i.test(signature)) return false;
    const signatureBuffer = Buffer.from(signature, 'hex');
    return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  });
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Parses a Stripe `checkout.session.completed` event — the event a Payment
 * Link's checkout produces — out of already signature-verified raw bytes.
 * Returns null for any other event type or malformed payload so the caller
 * can acknowledge and ignore it rather than treat it as a payment.
 */
export function parseStripeCheckoutCompletedEvent(rawBody: Buffer): VerifiedStripeCheckoutEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const event = parsed as Record<string, unknown>;
  if (event.type !== 'checkout.session.completed') return null;

  const eventId = stringField(event, 'id');
  const data = event.data;
  const session = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).object
    : null;
  if (!eventId || !session || typeof session !== 'object' || Array.isArray(session)) return null;

  const sessionRecord = session as Record<string, unknown>;
  const sessionId = stringField(sessionRecord, 'id');
  if (!sessionId) return null;

  const amountTotal = typeof sessionRecord.amount_total === 'number' ? sessionRecord.amount_total : null;

  return {
    eventId,
    sessionId,
    paymentIntentId: stringField(sessionRecord, 'payment_intent'),
    clientReferenceId: stringField(sessionRecord, 'client_reference_id'),
    amountTotal,
    currency: stringField(sessionRecord, 'currency'),
    paymentStatus: stringField(sessionRecord, 'payment_status') ?? 'unknown',
    paymentLinkId: stringField(sessionRecord, 'payment_link'),
  };
}

/**
 * The link a founder should actually send: the stored Payment Link plus the
 * `client_reference_id` query parameter Stripe forwards into the resulting
 * Checkout Session, without which an inbound webhook cannot be correlated
 * back to this prospect.
 */
export function buildTrackedStripePaymentLinkUrl(paymentLinkUrl: string, prospectId: string): string | null {
  try {
    const url = new URL(paymentLinkUrl);
    url.searchParams.set('client_reference_id', prospectId);
    return url.toString();
  } catch {
    return null;
  }
}
