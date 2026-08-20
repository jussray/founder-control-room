import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- canonical founder-content contracts are CommonJS.
import canonicalAuthorization from '../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';
// @ts-expect-error -- canonical founder-content contracts are CommonJS.
import canonicalSocial from '../../../tools/founder-content-contracts/social-distribution-contract.cjs';
// @ts-expect-error -- the Zapier path is a CommonJS compatibility export.
import zapierAuthorization from '../../../tools/zapier/founder-content-authorization-contract.cjs';
// @ts-expect-error -- the Zapier path is a CommonJS compatibility export.
import zapierSocial from '../../../tools/zapier/social-distribution-contract.cjs';

const zapierAuthorizationSource = readFileSync(
  new URL('../../../tools/zapier/founder-content-authorization-contract.cjs', import.meta.url),
  'utf8',
);
const zapierSocialSource = readFileSync(
  new URL('../../../tools/zapier/social-distribution-contract.cjs', import.meta.url),
  'utf8',
);

describe('founder-content provider-neutral contract placement', () => {
  it('keeps Zapier paths as explicit compatibility exports with the same public contract', () => {
    expect(zapierAuthorizationSource).toContain(
      "module.exports = require('../founder-content-contracts/founder-content-authorization-contract.cjs');",
    );
    expect(zapierSocialSource).toContain(
      "module.exports = require('../founder-content-contracts/social-distribution-contract.cjs');",
    );

    expect(Object.keys(zapierAuthorization).sort()).toEqual(Object.keys(canonicalAuthorization).sort());
    expect(Object.keys(zapierSocial).sort()).toEqual(Object.keys(canonicalSocial).sort());

    const hashInput = { contract: 'provider-neutral', version: 1 };
    expect(zapierAuthorization.hashPublicPayload(hashInput)).toBe(
      canonicalAuthorization.hashPublicPayload(hashInput),
    );

    const urlInput = [
      'https://example.com/launch',
      {
        platform: 'linkedin',
        campaignSlug: 'provider-neutral-contract',
        contentId: '123e4567-e89b-12d3-a456-426614174000',
      },
    ];
    expect(zapierSocial.buildTrackedUrl(...urlInput)).toBe(
      canonicalSocial.buildTrackedUrl(...urlInput),
    );
  });
});
