import { createHmac } from 'node:crypto';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FCR_SHOPIFY_STORE_FINGERPRINT,
  FCR_SHOPIFY_STORE_IDENTITY,
  buildFcrShopifyPaidReceipt,
} from '../../../fcrCommerce/shopifyMoneyPath.js';
import { rateLimitFcrShopifyWebhook } from '../../fcrCommerceIngress.js';
import {
  createShopifyFcrCommerceWebhookHandler,
  storedFcrCommerceOrderReceiptMatches,
  storedFcrCommerceReceiptMatches,
  type FcrCommerceReceiptStore,
} from '../shopifyFcrCommerce.js';

const SECRET = 'fcr-shopify-test-secret';
const HASH_SALT = 'fcr-commerce-test-hash-salt';
const WEBHOOK_ID = '11111111-2222-4333-8444-555555555555';
const EVENT_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const TRIGGERED_AT = '2026-09-20T02:55:00.000Z';

function app(store: FcrCommerceReceiptStore) {
  const instance = express();
  instance.post(
    '/webhooks/shopify/fcr/orders-paid',
    rateLimitFcrShopifyWebhook,
    express.raw({ type: 'application/json', limit: '64kb' }),
    createShopifyFcrCommerceWebhookHandler(store),
  );
  return instance;
}

function paidOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 999001,
    admin_graphql_api_id: 'gid://shopify/Order/999001',
    financial_status: 'paid',
    currency: 'USD',
    current_total_price: '249.00',
    line_items: [
      {
        product_id: 10820354834737,
        variant_id: 56213760442673,
        sku: 'FCR-QUICKSCAN-249',
        quantity: 1,
      },
    ],
    ...overrides,
  };
}

function headers(raw: string, overrides: Record<string, string> = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Topic': 'orders/paid',
    'X-Shopify-Shop-Domain': FCR_SHOPIFY_STORE_IDENTITY.shopifyDomain,
    'X-Shopify-Webhook-Id': WEBHOOK_ID,
    'X-Shopify-Event-Id': EVENT_ID,
    'X-Shopify-Triggered-At': TRIGGERED_AT,
    'X-Shopify-Hmac-SHA256': createHmac('sha256', SECRET).update(raw).digest('base64'),
    ...overrides,
  };
}

describe('FCR Shopify commerce webhook', () => {
  const originalSecret = process.env.FCR_SHOPIFY_WEBHOOK_SECRET;
  const originalSalt = process.env.FCR_COMMERCE_HASH_SALT;

  beforeEach(() => {
    process.env.FCR_SHOPIFY_WEBHOOK_SECRET = SECRET;
    process.env.FCR_COMMERCE_HASH_SALT = HASH_SALT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.FCR_SHOPIFY_WEBHOOK_SECRET;
    else process.env.FCR_SHOPIFY_WEBHOOK_SECRET = originalSecret;
    if (originalSalt === undefined) delete process.env.FCR_COMMERCE_HASH_SALT;
    else process.env.FCR_COMMERCE_HASH_SALT = originalSalt;
  });

  it('recognizes a verified FCR Shopify paid order as collected revenue', async () => {
    const store = vi.fn<FcrCommerceReceiptStore>().mockResolvedValue('stored');
    const raw = JSON.stringify(paidOrder());
    const response = await request(app(store))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw))
      .send(raw);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      accepted: true,
      duplicate: false,
      event: 'payment_collected',
      revenueState: 'payment_collected',
      collectedValueCents: 24900,
      currency: 'USD',
    });
    expect(store).toHaveBeenCalledOnce();
    expect(store.mock.calls[0]?.[0]).toMatchObject({
      contract: 'founder-control-room/shopify-money-path@v1',
      provider: 'shopify',
      storeFingerprint: FCR_SHOPIFY_STORE_FINGERPRINT,
      shopDomain: FCR_SHOPIFY_STORE_IDENTITY.shopifyDomain,
      webhookId: WEBHOOK_ID,
      eventId: EVENT_ID,
      offerKeys: ['business_leak_quickscan'],
      unknownOfferCount: 0,
    });
    const serialized = JSON.stringify(store.mock.calls[0]?.[0]);
    expect(serialized).not.toMatch(/customer|email|phone|address|payment_method/i);
  });

  it('keeps an unknown future FCR offer as its own receipt without losing real paid-store revenue', async () => {
    const store = vi.fn<FcrCommerceReceiptStore>().mockResolvedValue('stored');
    const raw = JSON.stringify(paidOrder({
      current_total_price: '12.00',
      line_items: [{ product_id: 1, variant_id: 2, sku: 'FUTURE-FCR', quantity: 1 }],
    }));
    const response = await request(app(store))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw))
      .send(raw);

    expect(response.status).toBe(201);
    expect(store.mock.calls[0]?.[0]).toMatchObject({
      collectedValueCents: 1200,
      offerKeys: [],
      unknownOfferCount: 1,
      revenueState: 'payment_collected',
    });
  });

  it('fails closed for another Shopify store even with a valid signature', async () => {
    const store = vi.fn<FcrCommerceReceiptStore>();
    const raw = JSON.stringify(paidOrder());
    const response = await request(app(store))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw, { 'X-Shopify-Shop-Domain': 'another-shop.myshopify.com' }))
      .send(raw);

    expect(response.status).toBe(403);
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects an invalid HMAC before parsing or persisting order data', async () => {
    const store = vi.fn<FcrCommerceReceiptStore>();
    const raw = JSON.stringify(paidOrder());
    const response = await request(app(store))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw, { 'X-Shopify-Hmac-SHA256': 'not-valid' }))
      .send(raw);

    expect(response.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it('requires provider delivery and merchant-event identities before persistence', async () => {
    const store = vi.fn<FcrCommerceReceiptStore>();
    const raw = JSON.stringify(paidOrder());

    const missingEvent = await request(app(store))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw, { 'X-Shopify-Event-Id': '' }))
      .send(raw);
    expect(missingEvent.status).toBe(400);
    expect(missingEvent.body.error).toBe('invalid_event_id');

    const invalidWebhook = await request(app(store))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw, { 'X-Shopify-Webhook-Id': 'not-a-uuid' }))
      .send(raw);
    expect(invalidWebhook.status).toBe(400);
    expect(invalidWebhook.body.error).toBe('invalid_webhook_id');

    expect(store).not.toHaveBeenCalled();
  });

  it('does not recognize missing, unpaid, refunded, wrong-currency, or zero-value payloads as revenue', async () => {
    const store = vi.fn<FcrCommerceReceiptStore>();
    for (const payload of [
      paidOrder({ financial_status: undefined }),
      paidOrder({ financial_status: 'pending' }),
      paidOrder({ financial_status: 'partially_refunded' }),
      paidOrder({ currency: 'EUR' }),
      paidOrder({ current_total_price: '0.00' }),
    ]) {
      const raw = JSON.stringify(payload);
      const response = await request(app(store))
        .post('/webhooks/shopify/fcr/orders-paid')
        .set(headers(raw))
        .send(raw);
      expect(response.status).toBe(400);
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('treats another delivery id for the same Shopify merchant event as a semantic duplicate', () => {
    const receipt = buildFcrShopifyPaidReceipt({
      rawPayload: paidOrder(),
      webhookId: WEBHOOK_ID,
      eventId: EVENT_ID,
      shopDomain: FCR_SHOPIFY_STORE_IDENTITY.shopifyDomain,
      occurredAt: TRIGGERED_AT,
      hashSalt: HASH_SALT,
    });
    const stored = {
      webhook_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      event_id: receipt.eventId,
      contract_id: receipt.contract,
      provider: receipt.provider,
      store_fingerprint: receipt.storeFingerprint,
      shop_domain: receipt.shopDomain,
      order_ref_hash: receipt.orderRefHash,
      event_type: receipt.event,
      revenue_state: receipt.revenueState,
      collected_value_cents: receipt.collectedValueCents,
      currency: receipt.currency,
      offer_keys: receipt.offerKeys,
      unknown_offer_count: receipt.unknownOfferCount,
      occurred_at: '2026-09-20T02:56:00.000Z',
    };

    expect(storedFcrCommerceReceiptMatches(stored, receipt)).toBe(false);
    expect(storedFcrCommerceOrderReceiptMatches(stored, receipt)).toBe(true);
    expect(storedFcrCommerceOrderReceiptMatches({
      ...stored,
      event_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    }, receipt)).toBe(false);
    expect(storedFcrCommerceOrderReceiptMatches({
      ...stored,
      collected_value_cents: 1,
    }, receipt)).toBe(false);
  });

  it('preserves duplicates and conflicts as separate outcomes', async () => {
    const duplicateStore = vi.fn<FcrCommerceReceiptStore>().mockResolvedValue('duplicate');
    const conflictStore = vi.fn<FcrCommerceReceiptStore>().mockResolvedValue('conflict');
    const raw = JSON.stringify(paidOrder());

    const duplicate = await request(app(duplicateStore))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw))
      .send(raw);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);

    const conflict = await request(app(conflictStore))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw))
      .send(raw);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('commerce_receipt_conflict');
  });

  it('fails closed when webhook bindings are absent', async () => {
    delete process.env.FCR_SHOPIFY_WEBHOOK_SECRET;
    const store = vi.fn<FcrCommerceReceiptStore>();
    const raw = JSON.stringify(paidOrder());
    const response = await request(app(store))
      .post('/webhooks/shopify/fcr/orders-paid')
      .set(headers(raw))
      .send(raw);

    expect(response.status).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });
});