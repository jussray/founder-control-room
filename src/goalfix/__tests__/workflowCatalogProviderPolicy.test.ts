import { describe, expect, it } from 'vitest';
import {
  GoalfixContextResolutionError,
  parseGoalfixVerificationManifest,
} from '../contextResolution.js';

const inventoryOnlyManifest = JSON.stringify({
  repository: 'jussray/Sekret-Bip',
  tests: {
    catalogIsPassEvidence: false,
    workflowCatalog: [
      {
        id: 'repository-truth',
        name: 'Repository Truth Gate',
        required: true,
        status: 'active',
      },
      {
        id: 'product-design-playwright',
        name: 'Product Design Playwright Proof',
        required: true,
        status: 'active',
      },
    ],
  },
});

const providerPolicy = JSON.stringify({
  repository: 'jussray/Sekret-Bip',
  policy: {
    requiredCheckAuthority: 'repository-policy',
    requiredChecks: ['repository-truth', 'playwright-browser-proof'],
  },
});

describe('workflow catalog provider-proof boundary', () => {
  it('fails closed when a repository declares its workflow catalog is inventory only', () => {
    try {
      parseGoalfixVerificationManifest(
        inventoryOnlyManifest,
        'jussray/Sekret-Bip',
        'main',
        'main',
      );
      throw new Error('expected provider policy requirement');
    } catch (error) {
      expect(error).toBeInstanceOf(GoalfixContextResolutionError);
      expect((error as GoalfixContextResolutionError).code)
        .toBe('GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE');
    }
  });

  it('uses explicit provider check-run names instead of workflow display names', () => {
    expect(parseGoalfixVerificationManifest(
      inventoryOnlyManifest,
      'jussray/Sekret-Bip',
      'main',
      'main',
      providerPolicy,
    )).toEqual({
      manifestRepository: 'jussray/Sekret-Bip',
      requiredVerificationNames: ['repository-truth', 'playwright-browser-proof'],
    });
  });
});
