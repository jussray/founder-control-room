import express, { type Express } from 'express';

import { handleShopifyFcrCommerceWebhook } from './webhooks/shopifyFcrCommerce.js';

/**
 * Mount provider-signed FCR commerce ingress before the main browser/API app.
 * Shopify HMAC verification requires the exact raw request body, so this
 * boundary must run before any JSON parser consumes the bytes.
 */
export function mountFcrCommerceIngress(app: Express): void {
  app.post(
    '/webhooks/shopify/fcr/orders-paid',
    express.raw({ type: 'application/json', limit: '64kb' }),
    handleShopifyFcrCommerceWebhook,
  );
}
