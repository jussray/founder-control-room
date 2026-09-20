import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN,
  FOUNDER_CONTROL_ROOM_PROJECT_SLUG,
  FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN,
} from '../providers/ShopifyReadOnlyProvider.js';
import type { RevenueState } from '../types/growthInbox.js';

export const FCR_SHOPIFY_MONEY_PATH_CONTRACT =
  'founder-control-room/shopify-money-path@v1' as const;
export const FCR_SHOPIFY_PAID_TOPIC = 'orders/paid' as const;
export const FCR_SHOPIFY_CURRENCY = 'USD' as const;

export const FCR_SHOPIFY_STORE_IDENTITY = Object.freeze({
  projectSlug: FOUNDER_CONTROL_ROOM_PROJECT_SLUG,
  shopifyDomain: FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN,
  primaryDomain: FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN,
  currency: FCR_SHOPIFY_CURRENCY,
  contract: FCR_SHOPIFY_MONEY_PATH_CONTRACT,
});

/**
 * Non-secret continuity fingerprint. It correlates observations to the exact
 * FCR commerce boundary; it never grants Shopify authority or proves a live
 * session on its own.
 */
export const FCR_SHOPIFY_STORE_FINGERPRINT = createHash('sha256')
  .update(JSON.stringify(FCR_SHOPIFY_STORE_IDENTITY))
  .digest('hex');

export const FCR_SHOPIFY_OFFERS = Object.freeze({
  businessLeakQuickScan: Object.freeze({
    key: 'business_leak_quickscan',
    productId: '10820354834737',
    variantId: '56213760442673',
    handle: 'business-leak-quickscan',
    sku: 'FCR-QUICKSCAN-249',
    priceCents: 24_900,
    observedListingState: 'ACTIVE',
  }),
  founderProofAudit: Object.freeze({
    key: 'founder_proof_audit',
    productId: '10806855500081',
    variantId: '56132452516145',
    handle: 'founder-proof-audit',
    sku: 'FCR-PROOF-AUDIT-99',
    priceCents: 9_900,
    observedListingState: 'DRAFT',
  }),
  founderIntentFormula: Object.freeze({
    key: 'founder_intent_formula',
    productId: '10825909338417',
    variantId: '56234092691761',
    handle: 'founder-intent-formula™',
    sku: 'FCR-FIF-V1',
    priceCents: 1_900,
    observedListingState: 'DRAFT',
  }),
  livingTruthEarlyAccess: Object.freeze({
    key: 'living_truth_early_access',
    productId: '10827979882801',
    variantId: '56247417864497',
    handle: 'living-truth-early-access',
    sku: null,
    priceCents: 1_200,
    observedListingState: 'DRAFT',
  }),
} as const);

export type FcrShopifyOfferKey =
  (typeof FCR_SHOPIFY_OFFERS)[keyof typeof FCR_SHOPIFY_OFFERS]['key'];

export interface FcrShopifyPaidReceipt {
  contract: typeof FCR_SHOPIFY_MONEY_PATH_CONTRACT;
  provider: 'shopify';
  storeFingerprint: typeof FCR_SHOPIFY_STORE_FINGERPRINT;
  shopDomain: typeof FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN;
  webhookId: string;
  orderRefHash: string;
  event: 'payment_collected';
  revenueState: Extract<RevenueState, 'payment_collected'>;
  collectedValueCents: number;
  currency: typeof FCR_SHOPIFY_CURRENCY;
  offerKeys: FcrShopifyOfferKey[];
  unknownOfferCount: number;
  occurredAt: string;
}

export class FcrShopifyMoneyPathError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FcrShopifyMoneyPathError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function decimalDigitsOnly(value: string): boolean {
  if (value.length < 1 || value.length > 32) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

function integerId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  const text = stringValue(value);
  if (!text || text.length > 96) return null;

  const prefixes = [
    'gid://shopify/Product/',
    'gid://shopify/ProductVariant/',
    'gid://shopify/Order/',
  ] as const;

  let candidate = text;
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      candidate = text.slice(prefix.length);
      break;
    }
  }

  return decimalDigitsOnly(candidate) ? candidate : null;
}

function moneyToCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    return null;
  }
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function knownOfferKey(lineItem: Record<string, unknown>): FcrShopifyOfferKey | null {
  const productId = integerId(lineItem.product_id ?? lineItem.productId);
  const variantId = integerId(lineItem.variant_id ?? lineItem.variantId);
  const sku = stringValue(lineItem.sku);

  for (const offer of Object.values(FCR_SHOPIFY_OFFERS)) {
    const exactVariant = variantId && variantId === offer.variantId;
    const exactProduct = productId && productId === offer.productId;
    const exactSku = offer.sku && sku === offer.sku;
    if (exactVariant || (exactProduct && exactSku)) return offer.key;
  }
  return null;
}

export function normalizeShopifyDomain(value: string): string {
  const raw = value.trim().toLowerCase();
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/\.$/, '');
  } catch {
    return '';
  }
}

export function verifyFcrShopifyWebhookHmac(
  rawBody: Buffer,
  providedHmac: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !providedHmac) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const left = Buffer.from(providedHmac, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createFcrOrderRefHash(orderId: string, salt: string): string {
  if (salt.trim().length < 16) throw new FcrShopifyMoneyPathError('hash_salt_too_short');
  if (!orderId.trim()) throw new FcrShopifyMoneyPathError('missing_order_id');
  return createHmac('sha256', salt)
    .update(`fcr-shopify-order:${orderId.trim()}`)
    .digest('hex');
}

export function buildFcrShopifyPaidReceipt(input: {
  rawPayload: unknown;
  webhookId: string;
  shopDomain: string;
  occurredAt: string;
  hashSalt: string;
}): FcrShopifyPaidReceipt {
  if (normalizeShopifyDomain(input.shopDomain) !== FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN) {
    throw new FcrShopifyMoneyPathError('wrong_shop');
  }
  if (!/^[0-9a-f-]{20,100}$/i.test(input.webhookId)) {
    throw new FcrShopifyMoneyPathError('invalid_webhook_id');
  }
  const occurredAtMs = Date.parse(input.occurredAt);
  if (!Number.isFinite(occurredAtMs)) {
    throw new FcrShopifyMoneyPathError('invalid_occurred_at');
  }

  const payload = record(input.rawPayload);
  if (!payload) throw new FcrShopifyMoneyPathError('invalid_payload');

  // orders/paid is revenue authority only when the payload independently says
  // the order is paid. Missing, pending, authorized, refunded, or partially
  // refunded states fail closed instead of inheriting authority from the topic.
  const financialStatus = stringValue(payload.financial_status)?.toLowerCase();
  if (financialStatus !== 'paid') {
    throw new FcrShopifyMoneyPathError('order_not_paid');
  }

  const currency = stringValue(payload.currency)?.toUpperCase();
  if (currency !== FCR_SHOPIFY_CURRENCY) {
    throw new FcrShopifyMoneyPathError('wrong_currency');
  }

  const collectedValueCents = moneyToCents(
    payload.current_total_price ?? payload.total_price ?? payload.totalPrice,
  );
  if (!collectedValueCents || collectedValueCents < 1 || collectedValueCents > 100_000_000) {
    throw new FcrShopifyMoneyPathError('invalid_collected_value');
  }

  const orderId = integerId(payload.admin_graphql_api_id)
    ?? integerId(payload.id);
  if (!orderId) throw new FcrShopifyMoneyPathError('missing_order_id');

  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  const offerKeys = new Set<FcrShopifyOfferKey>();
  let unknownOfferCount = 0;
  for (const value of lineItems) {
    const lineItem = record(value);
    if (!lineItem) {
      unknownOfferCount += 1;
      continue;
    }
    const key = knownOfferKey(lineItem);
    if (key) offerKeys.add(key);
    else unknownOfferCount += 1;
  }

  return {
    contract: FCR_SHOPIFY_MONEY_PATH_CONTRACT,
    provider: 'shopify',
    storeFingerprint: FCR_SHOPIFY_STORE_FINGERPRINT,
    shopDomain: FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN,
    webhookId: input.webhookId.toLowerCase(),
    orderRefHash: createFcrOrderRefHash(orderId, input.hashSalt),
    event: 'payment_collected',
    revenueState: 'payment_collected',
    collectedValueCents,
    currency: FCR_SHOPIFY_CURRENCY,
    offerKeys: [...offerKeys].sort(),
    unknownOfferCount,
    occurredAt: new Date(occurredAtMs).toISOString(),
  };
}
