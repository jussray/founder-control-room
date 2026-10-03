import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildFcrWhopPaidReceipt,
  FCR_WHOP_MAX_WEBHOOK_AGE_SECONDS,
  verifyWhopWebhookSignature,
} from '../whopMoneyPath.js';

const SECRET = 'ws_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const HASH_SALT = 'fcr-whop-test-hash-salt';
const WEBHOOK_ID = 'msg_bQPHmO2eBnHYtWWuxAN9K3Xd';
const NOW_SECONDS = 1_786_381_404;

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: WEBHOOK_ID,
    type: 'payment.succeeded',
    api_version: 'v1',
    api_version_date: '2026-09-29',
    timestamp: '2026-08-10T17:03:24.291Z',
    account_id: 'biz_FCRTESTACCOUNT',
    data: {
      id: 'pay_FCRTESTPAYMENT',
      status: 'paid',
      substatus: 'succeeded',
      total: {
        amount: '50.00',
        currency: 'usd',
        decimals: 2,
        display_decimals: 2,
      },
      customer_email: 'must-not-survive@example.com',
      customer_phone: '+15555555555',
      shipping_address: { line1: 'must not survive' },
      payment_instrument: { display_name: 'must not survive' },
    },
    ...overrides,
  };
}

function signature(rawBody: Buffer, timestamp = String(NOW_SECONDS)) {
  const signed = Buffer.concat([
    Buffer.from(`${WEBHOOK_ID}.${timestamp}.`, 'utf8'),
    rawBody,
  ]);
  const digest = createHmac('sha256', SECRET).update(signed).digest('base64');
  return `v1,${digest}`;
}

describe('FCR Whop payment witness', () => {
  it('verifies the current Standard Webhooks signature over exact raw bytes', () => {
    const rawBody = Buffer.from(JSON.stringify(payload()));
    expect(verifyWhopWebhookSignature({
      rawBody,
      headers: {
        webhookId: WEBHOOK_ID,
        webhookTimestamp: String(NOW_SECONDS),
        webhookSignature: signature(rawBody),
      },
      secret: SECRET,
      nowMs: NOW_SECONDS * 1000,
    })).toBe(true);
  });

  it('rejects bad signatures, malformed secrets, and stale or future timestamps', () => {
    const rawBody = Buffer.from(JSON.stringify(payload()));
    const baseline = {
      rawBody,
      headers: {
        webhookId: WEBHOOK_ID,
        webhookTimestamp: String(NOW_SECONDS),
        webhookSignature: signature(rawBody),
      },
      secret: SECRET,
      nowMs: NOW_SECONDS * 1000,
    };

    expect(verifyWhopWebhookSignature({
      ...baseline,
      headers: { ...baseline.headers, webhookSignature: 'v1,not-valid' },
    })).toBe(false);

    expect(verifyWhopWebhookSignature({
      ...baseline,
      secret: 'not-a-whop-secret',
    })).toBe(false);

    expect(verifyWhopWebhookSignature({
      ...baseline,
      nowMs: (NOW_SECONDS + FCR_WHOP_MAX_WEBHOOK_AGE_SECONDS + 1) * 1000,
    })).toBe(false);

    expect(verifyWhopWebhookSignature({
      ...baseline,
      nowMs: (NOW_SECONDS - FCR_WHOP_MAX_WEBHOOK_AGE_SECONDS - 1) * 1000,
    })).toBe(false);
  });

  it('normalizes only privacy-safe payment evidence', () => {
    const receipt = buildFcrWhopPaidReceipt({
      rawPayload: payload(),
      webhookId: WEBHOOK_ID,
      hashSalt: HASH_SALT,
    });

    expect(receipt).toMatchObject({
      contract: 'founder-control-room/whop-money-path@v1',
      provider: 'whop',
      webhookId: WEBHOOK_ID,
      eventId: 'pay_FCRTESTPAYMENT',
      event: 'payment_collected',
      revenueState: 'payment_collected',
      collectedValueCents: 5000,
      currency: 'USD',
      apiVersion: 'v1',
      apiVersionDate: '2026-09-29',
    });
    expect(receipt.accountFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.paymentRefHash).toMatch(/^[0-9a-f]{64}$/);

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toMatch(
      /customer|email|phone|shipping|payment_instrument|card|address/i,
    );
  });

  it('uses payment id as semantic event identity while webhook id stays delivery identity', () => {
    const first = buildFcrWhopPaidReceipt({
      rawPayload: payload(),
      webhookId: WEBHOOK_ID,
      hashSalt: HASH_SALT,
    });
    const secondWebhookId = 'msg_SECONDDELIVERY123';
    const second = buildFcrWhopPaidReceipt({
      rawPayload: payload({ id: secondWebhookId }),
      webhookId: secondWebhookId,
      hashSalt: HASH_SALT,
    });

    expect(first.webhookId).not.toBe(second.webhookId);
    expect(first.eventId).toBe(second.eventId);
    expect(first.paymentRefHash).toBe(second.paymentRefHash);
  });

  it('fails closed on unsupported events, unpaid states, wrong currency, and id mismatch', () => {
    expect(() => buildFcrWhopPaidReceipt({
      rawPayload: payload({ type: 'payment.failed' }),
      webhookId: WEBHOOK_ID,
      hashSalt: HASH_SALT,
    })).toThrowError(/unsupported_event/);

    expect(() => buildFcrWhopPaidReceipt({
      rawPayload: payload({
        data: {
          ...payload().data as Record<string, unknown>,
          status: 'pending',
        },
      }),
      webhookId: WEBHOOK_ID,
      hashSalt: HASH_SALT,
    })).toThrowError(/payment_not_succeeded/);

    expect(() => buildFcrWhopPaidReceipt({
      rawPayload: payload({
        data: {
          ...payload().data as Record<string, unknown>,
          total: { amount: '50.00', currency: 'eur', decimals: 2 },
        },
      }),
      webhookId: WEBHOOK_ID,
      hashSalt: HASH_SALT,
    })).toThrowError(/invalid_total/);

    expect(() => buildFcrWhopPaidReceipt({
      rawPayload: payload(),
      webhookId: 'msg_DIFFERENT',
      hashSalt: HASH_SALT,
    })).toThrowError(/webhook_id_mismatch/);
  });
});
