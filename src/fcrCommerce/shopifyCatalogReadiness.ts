export const FCR_SHOPIFY_CATALOG_CONTRACT = 'founder-control-room/shopify-catalog@v1' as const;

/**
 * Product images are part of the offer contract, not decoration added later.
 * Every FCR Shopify listing must have a relevant, intentional cover image
 * before it can be treated as storefront-ready.
 */
export const FCR_SHOPIFY_IMAGE_POLICY = Object.freeze({
  requiredForLaunch: true,
  requireHttps: true,
  requireAltText: true,
  forbidPlaceholderCopy: true,
});

export interface FcrShopifyCatalogListing {
  key: string;
  productId: string;
  variantId: string;
  handle: string;
  sku: string | null;
  observedListingState: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  observedPriceCents: number;
  imageUrl: string | null;
  imageAlt: string | null;
  productType: string;
  vendor: string;
  observedAt: string;
}

export const FCR_SHOPIFY_CATALOG = Object.freeze({
  counselLegalIntelligence: Object.freeze({
    key: 'counsel_legal_intelligence',
    productId: '10843750039857',
    variantId: '56408949162289',
    handle: 'counsel-legal-intelligence-research-workspace',
    sku: 'FCR-COUNSEL-EA',
    observedListingState: 'DRAFT',
    observedPriceCents: 0,
    imageUrl: 'https://cdn.shopify.com/s/files/1/1003/0078/3921/files/counsel-legal-intelligence-cover.png?v=1790041799',
    imageAlt: 'COUNSEL legal intelligence workspace cover with dark purple, forest green, orange and gold law library aesthetic',
    productType: 'Software',
    vendor: 'FCR',
    observedAt: '2026-09-22T01:49:59.000Z',
  }),
} as const satisfies Record<string, FcrShopifyCatalogListing>);

export interface FcrCatalogReadiness {
  ready: boolean;
  blockers: string[];
}

function isHttpsUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Storefront readiness is deliberately stricter than "a product exists".
 * A draft with the right image is still not launch-ready until price and
 * publication state are explicitly set. This keeps catalog work reversible.
 */
export function evaluateFcrShopifyCatalogReadiness(
  listing: FcrShopifyCatalogListing,
): FcrCatalogReadiness {
  const blockers: string[] = [];

  if (!listing.productId || !/^\d+$/.test(listing.productId)) {
    blockers.push('missing_or_invalid_product_id');
  }
  if (!listing.variantId || !/^\d+$/.test(listing.variantId)) {
    blockers.push('missing_or_invalid_variant_id');
  }
  if (!listing.handle.trim()) blockers.push('missing_handle');
  if (listing.observedListingState !== 'ACTIVE') blockers.push('listing_not_active');
  if (!Number.isSafeInteger(listing.observedPriceCents) || listing.observedPriceCents < 1) {
    blockers.push('price_not_set');
  }
  if (!isHttpsUrl(listing.imageUrl)) blockers.push('relevant_cover_image_missing');
  if (!listing.imageAlt?.trim()) blockers.push('image_alt_missing');

  return { ready: blockers.length === 0, blockers };
}

/**
 * Shared invariant for every future FCR Shopify product binding.
 * Adding a product without a relevant cover image is a catalog failure.
 */
export function assertFcrShopifyProductHasImage(
  listing: Pick<FcrShopifyCatalogListing, 'imageUrl' | 'imageAlt'>,
): void {
  if (!isHttpsUrl(listing.imageUrl) || !listing.imageAlt?.trim()) {
    throw new Error('FCR Shopify product requires a relevant HTTPS cover image and alt text');
  }
}
