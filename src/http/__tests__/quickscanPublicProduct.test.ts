import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Business Leak QuickScan public product path', () => {
  it('serves the Shopify-declared product path from the Pages-owned public bundle', () => {
    const edge = read('public/_worker.js');

    expect(edge).toContain("'/products/business-leak-quickscan'");
    expect(edge).toContain("'/products/business-leak-quickscan/'");
    expect(edge).toContain('STATIC_EXACT_PATHS.has(pathname)');
  });

  it('preserves the fit-check authority gate instead of exposing direct checkout', () => {
    const product = read('public/products/business-leak-quickscan/index.html');

    expect(product).toContain('https://foundercontrolroom.org/products/business-leak-quickscan');
    expect(product).toContain('data-offer-sku="FCR-QUICKSCAN-249"');
    expect(product).toContain('data-price-cents="24900"');
    expect(product).toContain('data-authority="fit-check-required"');
    expect(product).toContain('Fit check required before purchase');
    expect(product).toContain('Request the 10-minute fit check');
    expect(product).toContain('https://www.linkedin.com/in/juss-rayy-13ba691a1');
    expect(product).not.toContain('/cart/');
    expect(product).not.toContain('checkout.shopify.com');
    expect(product).not.toMatch(/>\s*Buy now\s*</i);
  });
});
