import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Founder Proof Audit Shopify-to-FCR product destination', () => {
  it('routes the Shopify product URL to the Pages-owned product page', () => {
    const worker = read('public/_worker.js');
    expect(worker).toContain("'/products/founder-proof-audit'");
    expect(worker).toContain("'/products/founder-proof-audit/'");
    expect(worker).toContain('STATIC_EXACT_PATHS.has(pathname)');
  });

  it('presents the observed $99 offer without inventing checkout readiness', () => {
    const page = read('public/products/founder-proof-audit/index.html');
    expect(page).toContain('Founder Proof Audit');
    expect(page).toContain('https://foundercontrolroom.org/products/founder-proof-audit');
    expect(page).toContain('data-offer-sku="FCR-PROOF-AUDIT-99"');
    expect(page).toContain('data-price-cents="9900"');
    expect(page).toContain('REALITY → FIX → PROOF → RISK → NEXT GATE');
    expect(page).toContain('Request an audit');
    expect(page).not.toContain('jussbeautifulhair.com');
    expect(page).not.toContain('checkout.shopify.com');
    expect(page).not.toMatch(/>\s*Buy now\s*</i);
  });
});
