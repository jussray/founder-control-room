import { describe, expect, it } from 'vitest';

import {
  interactiveEnvelopeIsSubset,
  type L99InteractiveAuthorityEnvelope,
} from '../l99InteractiveCapabilityPolicy.js';

const parent: L99InteractiveAuthorityEnvelope = {
  capability: 'browser.external_mutation',
  targetPatterns: ['https://example.com'],
  allowedOperations: ['open', 'read', 'click', 'submit'],
  externalMutation: true,
  requiresFounderReceipt: true,
  requiresPlaywrightProof: true,
  expiresAt: '2026-08-20T00:00:00Z',
};

describe('interactive authority monotonicity', () => {
  it('allows a narrower read-only browser grant', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          capability: 'browser.read',
          allowedOperations: ['read'],
          externalMutation: false,
          requiresFounderReceipt: false,
        },
        parent,
      ),
    ).toBe(true);
  });

  it('rejects a target expansion', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          targetPatterns: ['https://example.com', 'https://other.example'],
        },
        parent,
      ),
    ).toBe(false);
  });

  it('rejects an operation expansion', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          allowedOperations: [...parent.allowedOperations, 'delete'],
        },
        parent,
      ),
    ).toBe(false);
  });
});
