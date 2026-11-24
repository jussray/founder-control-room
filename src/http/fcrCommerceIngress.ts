import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';

import { handleShopifyFcrCommerceWebhook } from './webhooks/shopifyFcrCommerce.js';

/**
 * Provider webhooks are authenticated independently by Shopify HMAC. The
 * route-local rate limit is an abuse cap, not an authorization substitute.
 * It is deliberately generous enough for retries/bursts while bounding work
 * performed before provider verification completes.
 */
export const rateLimitFcrShopifyWebhook = rateLimit({
  windowMs: 60 * 1_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'FCR Shopify webhook rate limit exceeded.' },
});

/**
 * Mount provider-signed FCR commerce ingress before the main browser/API app.
 * Shopify HMAC verification requires the exact raw request body, so this
 * boundary must run before any JSON parser consumes the bytes.
 */
export function mountFcrCommerceIngress(app: Express): void {
  app.post(
    '/webhooks/shopify/fcr/orders-paid',
    rateLimitFcrShopifyWebhook,
    express.raw({ type: 'application/json', limit: '64kb' }),
    handleShopifyFcrCommerceWebhook,
  );
}
