import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';

import { handleShopifyFcrCommerceWebhook } from './webhooks/shopifyFcrCommerce.js';
import { handleWhopFcrCommerceWebhook } from './webhooks/whopFcrCommerce.js';

/**
 * Provider webhooks are authenticated independently by provider signatures.
 * Route-local rate limits are abuse caps, not authorization substitutes.
 */
export const rateLimitFcrShopifyWebhook = rateLimit({
  windowMs: 60 * 1_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'FCR Shopify webhook rate limit exceeded.' },
});

export const rateLimitFcrWhopWebhook = rateLimit({
  windowMs: 60 * 1_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'FCR Whop webhook rate limit exceeded.' },
});

/**
 * Mount provider-signed FCR commerce ingress before the main browser/API app.
 * Both Shopify and Whop verification require the exact raw request body, so
 * this boundary must run before any JSON parser consumes the bytes.
 */
export function mountFcrCommerceIngress(app: Express): void {
  app.post(
    '/webhooks/shopify/fcr/orders-paid',
    rateLimitFcrShopifyWebhook,
    express.raw({ type: 'application/json', limit: '64kb' }),
    handleShopifyFcrCommerceWebhook,
  );

  app.post(
    '/webhooks/whop/fcr/payments-succeeded',
    rateLimitFcrWhopWebhook,
    express.raw({ type: 'application/json', limit: '64kb' }),
    handleWhopFcrCommerceWebhook,
  );
}
