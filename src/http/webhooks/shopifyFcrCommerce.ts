import type { Request, RequestHandler, Response } from 'express';

import {
  FCR_SHOPIFY_PAID_TOPIC,
  FcrShopifyMoneyPathError,
  buildFcrShopifyPaidReceipt,
  normalizeShopifyDomain,
  verifyFcrShopifyWebhookHmac,
  type FcrShopifyPaidReceipt,
} from '../../fcrCommerce/shopifyMoneyPath.js';
import { FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN } from '../../providers/ShopifyReadOnlyProvider.js';

export type FcrCommerceReceiptStoreDisposition = 'stored' | 'duplicate' | 'conflict';
export type FcrCommerceReceiptStore = (
  receipt: FcrShopifyPaidReceipt,
) => Promise<FcrCommerceReceiptStoreDisposition>;

const RECEIPT_COLUMNS = [
  'webhook_id',
  'event_id',
  'contract_id',
  'provider',
  'store_fingerprint',
  'shop_domain',
  'order_ref_hash',
  'event_type',
  'revenue_state',
  'collected_value_cents',
  'currency',
  'offer_keys',
  'unknown_offer_count',
  'occurred_at',
].join(',');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameStringArray(left: unknown, right: readonly string[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function storedFcrCommerceOrderReceiptMatches(
  stored: unknown,
  receipt: FcrShopifyPaidReceipt,
): boolean {
  if (!isRecord(stored)) return false;
  return (
    stored.event_id === receipt.eventId
    && stored.contract_id === receipt.contract
    && stored.provider === receipt.provider
    && stored.store_fingerprint === receipt.storeFingerprint
    && stored.shop_domain === receipt.shopDomain
    && stored.order_ref_hash === receipt.orderRefHash
    && stored.event_type === receipt.event
    && stored.revenue_state === receipt.revenueState
    && stored.collected_value_cents === receipt.collectedValueCents
    && stored.currency === receipt.currency
    && sameStringArray(stored.offer_keys, receipt.offerKeys)
    && stored.unknown_offer_count === receipt.unknownOfferCount
  );
}

export function storedFcrCommerceReceiptMatches(
  stored: unknown,
  receipt: FcrShopifyPaidReceipt,
): boolean {
  if (!isRecord(stored)) return false;
  return (
    stored.webhook_id === receipt.webhookId
    && stored.occurred_at === receipt.occurredAt
    && storedFcrCommerceOrderReceiptMatches(stored, receipt)
  );
}

export const persistFcrCommerceReceipt: FcrCommerceReceiptStore = async (receipt) => {
  // Use the canonical FCR Supabase client so privileged writes are bound to
  // SUPABASE_URL and the checked-in Founder Control Room project identity.
  // Do not use the legacy NEXT_PUBLIC_* client for this server authority path.
  const { supabase: admin } = await import('../../lib/supabaseClient.js');

  const readExistingByWebhookId = async (): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('fcr_commerce_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('webhook_id', receipt.webhookId)
      .maybeSingle();
    if (error) throw new Error('fcr_commerce_receipt_lookup_failed');
    return isRecord(data) ? data : null;
  };

  const readExistingByEventId = async (): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('fcr_commerce_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('provider', receipt.provider)
      .eq('shop_domain', receipt.shopDomain)
      .eq('event_id', receipt.eventId)
      .maybeSingle();
    if (error) throw new Error('fcr_commerce_receipt_lookup_failed');
    return isRecord(data) ? data : null;
  };

  const readExistingByOrder = async (): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('fcr_commerce_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('provider', receipt.provider)
      .eq('shop_domain', receipt.shopDomain)
      .eq('order_ref_hash', receipt.orderRefHash)
      .eq('event_type', receipt.event)
      .maybeSingle();
    if (error) throw new Error('fcr_commerce_receipt_lookup_failed');
    return isRecord(data) ? data : null;
  };

  const existingByWebhookId = await readExistingByWebhookId();
  if (existingByWebhookId) {
    return storedFcrCommerceReceiptMatches(existingByWebhookId, receipt)
      ? 'duplicate'
      : 'conflict';
  }

  // Shopify's event id is shared across all deliveries produced by the same
  // merchant action. It is the provider-native semantic dedupe identity;
  // webhook_id remains only the individual delivery identity.
  const existingByEventId = await readExistingByEventId();
  if (existingByEventId) {
    return storedFcrCommerceOrderReceiptMatches(existingByEventId, receipt)
      ? 'duplicate'
      : 'conflict';
  }

  const existingByOrder = await readExistingByOrder();
  if (existingByOrder) {
    // The pre-activation v1 ledger also has an order/event uniqueness guard.
    // A different provider event for the same order is therefore surfaced as
    // an explicit conflict rather than silently collapsed into fake revenue.
    return storedFcrCommerceOrderReceiptMatches(existingByOrder, receipt)
      ? 'duplicate'
      : 'conflict';
  }

  const { error: insertError } = await admin.from('fcr_commerce_receipts').insert({
    webhook_id: receipt.webhookId,
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
    occurred_at: receipt.occurredAt,
  });

  if (!insertError) return 'stored';
  if ((insertError as { code?: string }).code !== '23505') {
    throw new Error('fcr_commerce_receipt_store_failed');
  }

  // A concurrent retry may collide on the provider webhook id, provider event
  // id, or the conservative pre-activation order guard. Re-read each identity
  // and classify it instead of retrying a durable duplicate forever.
  const racedByWebhookId = await readExistingByWebhookId();
  if (racedByWebhookId) {
    return storedFcrCommerceReceiptMatches(racedByWebhookId, receipt)
      ? 'duplicate'
      : 'conflict';
  }

  const racedByEventId = await readExistingByEventId();
  if (racedByEventId) {
    return storedFcrCommerceOrderReceiptMatches(racedByEventId, receipt)
      ? 'duplicate'
      : 'conflict';
  }

  const racedByOrder = await readExistingByOrder();
  if (racedByOrder) {
    return storedFcrCommerceOrderReceiptMatches(racedByOrder, receipt)
      ? 'duplicate'
      : 'conflict';
  }

  throw new Error('fcr_commerce_receipt_store_failed');
};

export function createShopifyFcrCommerceWebhookHandler(
  store: FcrCommerceReceiptStore = persistFcrCommerceReceipt,
): RequestHandler {
  return async function handleShopifyFcrCommerceWebhook(req: Request, res: Response) {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });

    const secret = process.env.FCR_SHOPIFY_WEBHOOK_SECRET?.trim();
    const hashSalt = process.env.FCR_COMMERCE_HASH_SALT?.trim();
    if (!secret || !hashSalt || hashSalt.length < 16) {
      return res.status(503).json({ error: 'FCR Shopify commerce ingest is not configured' });
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ error: 'invalid_body' });
    }

    const topic = req.get('x-shopify-topic')?.trim().toLowerCase() ?? '';
    if (topic !== FCR_SHOPIFY_PAID_TOPIC) {
      return res.status(400).json({ error: 'unsupported_topic' });
    }

    const shopDomain = normalizeShopifyDomain(req.get('x-shopify-shop-domain') ?? '');
    if (shopDomain !== FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN) {
      return res.status(403).json({ error: 'wrong_shop' });
    }

    if (!verifyFcrShopifyWebhookHmac(
      rawBody,
      req.get('x-shopify-hmac-sha256'),
      secret,
    )) {
      return res.status(401).json({ error: 'invalid_signature' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }

    let receipt: FcrShopifyPaidReceipt;
    try {
      receipt = buildFcrShopifyPaidReceipt({
        rawPayload: payload,
        webhookId: req.get('x-shopify-webhook-id') ?? '',
        eventId: req.get('x-shopify-event-id') ?? '',
        shopDomain,
        occurredAt: req.get('x-shopify-triggered-at') ?? '',
        hashSalt,
      });
    } catch (error) {
      const code = error instanceof FcrShopifyMoneyPathError
        ? error.code
        : 'invalid_paid_order';
      return res.status(400).json({ error: code });
    }

    try {
      const disposition = await store(receipt);
      if (disposition === 'conflict') {
        return res.status(409).json({
          accepted: false,
          error: 'commerce_receipt_conflict',
          webhookId: receipt.webhookId,
        });
      }

      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        webhookId: receipt.webhookId,
        event: receipt.event,
        revenueState: receipt.revenueState,
        collectedValueCents: receipt.collectedValueCents,
        currency: receipt.currency,
      });
    } catch {
      return res.status(503).json({ error: 'receipt_store_unavailable' });
    }
  };
}

export const handleShopifyFcrCommerceWebhook =
  createShopifyFcrCommerceWebhookHandler();