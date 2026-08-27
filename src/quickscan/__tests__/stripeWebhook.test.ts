import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildTrackedStripePaymentLinkUrl,
  parseStripeCheckoutCompletedEvent,
  verifyStripeWebhookSignature,
} from '../stripeWebhook.js';

const SECRET = 'whsec_test_secret';

function signedHeader(body: Buffer, timestampSeconds: number, secret = SECRET): string {
  const signature = createHmac('sha256', secret).update(`${timestampSeconds}.${body.toString('utf8')}`).digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}

function checkoutCompletedPayload(overrides: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        client_reference_id: 'prospect_1',
        payment_intent: 'pi_1',
        amount_total: 24900,
        currency: 'usd',
        payment_status: 'paid',
        payment_link: 'plink_test_1',
        ...overrides,
      },
    },
  }));
}

describe('verifyStripeWebhookSignature', () => {
  it('accepts a correctly signed body within the tolerance window', () => {
    const body = checkoutCompletedPayload();
    const nowMs = Date.now();
    const header = signedHeader(body, Math.floor(nowMs / 1000));

    expect(verifyStripeWebhookSignature(body, header, SECRET, { now: () => nowMs })).toBe(true);
  });

  it('rejects a body that does not match the signature', () => {
    const body = checkoutCompletedPayload();
    const nowMs = Date.now();
    const header = signedHeader(body, Math.floor(nowMs / 1000));
    const tampered = Buffer.from(body.toString('utf8').replace('cs_test_1', 'cs_test_evil'));

    expect(verifyStripeWebhookSignature(tampered, header, SECRET, { now: () => nowMs })).toBe(false);
  });

  it('rejects a signature produced with the wrong secret', () => {
    const body = checkoutCompletedPayload();
    const nowMs = Date.now();
    const header = signedHeader(body, Math.floor(nowMs / 1000), 'whsec_wrong');

    expect(verifyStripeWebhookSignature(body, header, SECRET, { now: () => nowMs })).toBe(false);
  });

  it('rejects a signed timestamp outside the replay tolerance window', () => {
    const body = checkoutCompletedPayload();
    const nowMs = Date.now();
    const staleTimestamp = Math.floor(nowMs / 1000) - 3600;
    const header = signedHeader(body, staleTimestamp);

    expect(verifyStripeWebhookSignature(body, header, SECRET, { now: () => nowMs })).toBe(false);
  });

  it('rejects a missing signature header or secret', () => {
    const body = checkoutCompletedPayload();
    expect(verifyStripeWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyStripeWebhookSignature(body, 'not-a-real-header', SECRET)).toBe(false);
    expect(verifyStripeWebhookSignature(body, signedHeader(body, Math.floor(Date.now() / 1000)), '')).toBe(false);
  });
});

describe('parseStripeCheckoutCompletedEvent', () => {
  it('extracts the fields needed to credit a prospect', () => {
    const event = parseStripeCheckoutCompletedEvent(checkoutCompletedPayload());

    expect(event).toEqual({
      eventId: 'evt_1',
      sessionId: 'cs_test_1',
      paymentIntentId: 'pi_1',
      clientReferenceId: 'prospect_1',
      amountTotal: 24900,
      currency: 'usd',
      paymentStatus: 'paid',
      paymentLinkId: 'plink_test_1',
    });
  });

  it('carries a missing payment_link through as null rather than guessing', () => {
    const event = parseStripeCheckoutCompletedEvent(checkoutCompletedPayload({ payment_link: undefined }));
    expect(event?.paymentLinkId).toBeNull();
  });

  it('returns null for an event type other than checkout.session.completed', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_2', type: 'payment_intent.succeeded', data: { object: {} } }));
    expect(parseStripeCheckoutCompletedEvent(body)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseStripeCheckoutCompletedEvent(Buffer.from('not json'))).toBeNull();
  });

  it('returns null when the session is missing an id', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { client_reference_id: 'p1' } } }));
    expect(parseStripeCheckoutCompletedEvent(body)).toBeNull();
  });

  it('carries a missing client_reference_id through as null rather than guessing', () => {
    const event = parseStripeCheckoutCompletedEvent(checkoutCompletedPayload({ client_reference_id: undefined }));
    expect(event?.clientReferenceId).toBeNull();
  });
});

describe('buildTrackedStripePaymentLinkUrl', () => {
  it('appends client_reference_id to a bare payment link', () => {
    expect(buildTrackedStripePaymentLinkUrl('https://buy.stripe.com/test_abc', 'prospect_1')).toBe(
      'https://buy.stripe.com/test_abc?client_reference_id=prospect_1',
    );
  });

  it('preserves existing query parameters', () => {
    expect(buildTrackedStripePaymentLinkUrl('https://buy.stripe.com/test_abc?locale=en', 'prospect_1')).toBe(
      'https://buy.stripe.com/test_abc?locale=en&client_reference_id=prospect_1',
    );
  });

  it('returns null for an unparseable URL rather than sending a broken link', () => {
    expect(buildTrackedStripePaymentLinkUrl('not a url', 'prospect_1')).toBeNull();
  });
});
