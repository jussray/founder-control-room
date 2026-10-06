import { describe, expect, it } from 'vitest';

import {
  FCR_SHOPIFY_CATALOG,
  assertFcrShopifyProductHasImage,
  evaluateFcrShopifyCatalogReadiness,
} from '../shopifyCatalogReadiness.js';

describe('FCR Shopify catalog readiness', () => {
  it('binds COUNSEL to the real Shopify product and its intentional cover image', () => {
    const listing = FCR_SHOPIFY_CATALOG.counselLegalIntelligence;

    expect(listing).toMatchObject({
      productId: '10843750039857',
      variantId: '56408949162289',
      handle: 'counsel-legal-intelligence-research-workspace',
      sku: 'FCR-COUNSEL-EA',
      observedListingState: 'DRAFT',
      observedPriceCents: 0,
    });
    expect(listing.imageUrl).toContain('counsel-legal-intelligence-cover.png');
    expect(() => assertFcrShopifyProductHasImage(listing)).not.toThrow();
  });

  it('requires a relevant cover image and alt text for every product binding', () => {
    expect(() => assertFcrShopifyProductHasImage({ imageUrl: null, imageAlt: null }))
      .toThrow(/requires a relevant HTTPS cover image/i);
    expect(() => assertFcrShopifyProductHasImage({
      imageUrl: 'http://example.com/image.png',
      imageAlt: 'Example',
    })).toThrow(/requires a relevant HTTPS cover image/i);
  });

  it('keeps the COUNSEL draft fail-closed until pricing and publication are explicitly set', () => {
    const result = evaluateFcrShopifyCatalogReadiness(
      FCR_SHOPIFY_CATALOG.counselLegalIntelligence,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'listing_not_active',
      'price_not_set',
    ]));
    expect(result.blockers).not.toContain('relevant_cover_image_missing');
    expect(result.blockers).not.toContain('image_alt_missing');
  });

  it('allows readiness only when identifiers, price, state, image, and alt text are all present', () => {
    const result = evaluateFcrShopifyCatalogReadiness({
      ...FCR_SHOPIFY_CATALOG.counselLegalIntelligence,
      observedListingState: 'ACTIVE',
      observedPriceCents: 1900,
    });

    expect(result).toEqual({ ready: true, blockers: [] });
  });
});
