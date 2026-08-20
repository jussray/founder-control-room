import { describe, expect, it } from 'vitest';
// @ts-expect-error -- canonical founder-content contracts are CommonJS.
import canonicalAuthorization from '../../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';
// @ts-expect-error -- canonical founder-content contracts are CommonJS.
import canonicalSocial from '../../../tools/founder-content-contracts/social-distribution-contract.cjs';
// @ts-expect-error -- the Zapier path is a CommonJS compatibility export.
import zapierAuthorization from '../../../tools/zapier/founder-content-authorization-contract.cjs';
// @ts-expect-error -- the Zapier path is a CommonJS compatibility export.
import zapierSocial from '../../../tools/zapier/social-distribution-contract.cjs';

describe('founder-content provider-neutral contract placement', () => {
  it('keeps Zapier paths as compatibility exports of the provider-neutral contracts', () => {
    expect(zapierAuthorization).toBe(canonicalAuthorization);
    expect(zapierSocial).toBe(canonicalSocial);
  });
});
