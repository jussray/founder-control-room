import { createHmac } from 'node:crypto';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWhopFcrCommerceWebhookHandler, type FcrWhopReceiptStore } from '../whopFcrCommerce.js';

const SECRET = 'ws_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const HASH_SALT = 'fcr-whop-test-hash-salt';
const WEBHOOK_ID = 'msg_bQPHmO2eBnHYtWWuxAN9K3Xd';

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
      total: { amount: '50.00', currency: 'usd', decimals: 2 },
      customer_email: 'must-not-survive@example.com',
    },
    ...overrides,
  };
}

function app(store: FcrWhopReceiptStore) {
  const instance = express();
  instance.post(
    '/webhooks/whop/fcr/payments-succeeded',
    express.raw({ type: 'application/json', limit: '64kb' }),
    createWhopFcrCommerceWebhookHandler(store),
  );
  return instance;
}

function headers(raw: string, overrides: Record<string, string> = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signed = Buffer.from(`${WEBHOOK_ID}.${timestamp}.${raw}`, 'utf8');
  const digest = createHmac('sha256', SECRET).update(signed).digest('base64');
  return {
    'Content-Type': 'application/json',
    'webhook-id': WEBHOOK_ID,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${digest}`,
    ...overrides,
  };
}

describe('FCR Whop commerce webhook', () => {
  const originalSecret = process.env.FCR_WHOP_WEBHOOK_SECRET;
  const originalSalt = process.env.FCR_COMMERCE_HASH_SALT;

  beforeEach(() => {
    process.env.FCR_WHOP_WEBHOOK_SECRET = SECRET;
    process.env.FCR_COMMERCE_HASH_SALT = HASH_SALT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.FCR_WHOP_WEBHOOK_SECRET;
    else process.env.FCR_WHOP_WEBHOOK_SECRET = originalSecret;
    if (originalSalt === undefined) delete process.env.FCR_COMMERCE_HASH_SALT;
    else process.env.FCR_COMMERCE_HASH_SALT = originalSalt;
  });

  it('accepts a verified payment.succeeded event', async () => {
    const store = vi.fn<FcrWhopReceiptStore>().mockResolvedValue('stored');
    const raw = JSON.stringify(payload());
    const response = await request(app(store))
      .post('/webhooks/whop/fcr/payments-succeeded')
      .set(headers(raw))
      .send(raw);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      accepted: true,
      duplicate: false,
      event: 'payment_collected',
      collectedValueCents: 5000,
      currency: 'USD',
    });
    expect(store).toHaveBeenCalledOnce();
    expect(store.mock.calls[0]?.[0]).toMatchObject({
      provider: 'whop',
      webhookId: WEBHOOK_ID,
      eventId: 'pay_FCRTESTPAYMENT',
    });
    expect(JSON.stringify(store.mock.calls[0]?.[0])).not.toMatch(/customer|email|phone|address/i);
  });

  it('rejects an invalid signature before persistence', async () => {
    const store = vi.fn<FcrWhopReceiptStore>();
    const raw = JSON.stringify(payload());
    const response = await request(app(store))
      .post('/webhooks/whop/fcr/payments-succeeded')
      .set(headers(raw, { 'webhook-signature': 'v1,not-valid' }))
      .send(raw);

    expect(response.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it('preserves duplicate and conflict as distinct outcomes', async () => {
    const raw = JSON.stringify(payload());
    const duplicateStore = vi.fn<FcrWhopReceiptStore>().mockResolvedValue('duplicate');
    const conflictStore = vi.fn<FcrWhopReceiptStore>().mockResolvedValue('conflict');

    const duplicate = await request(app(duplicateStore))
      .post('/webhooks/whop/fcr/payments-succeeded')
      .set(headers(raw))
      .send(raw);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);

    const conflict = await request(app(conflictStore))
      .post('/webhooks/whop/fcr/payments-succeeded')
      .set(headers(raw))
      .send(raw);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('commerce_receipt_conflict');
  });

  it('fails closed when bindings are absent', async () => {
    delete process.env.FCR_WHOP_WEBHOOK_SECRET;
    const store = vi.fn<FcrWhopReceiptStore>();
    const raw = JSON.stringify(payload());
    const response = await request(app(store))
      .post('/webhooks/whop/fcr/payments-succeeded')
      .set(headers(raw))
      .send(raw);

    expect(response.status).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });
});
