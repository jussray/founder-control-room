import { describe, expect, it } from 'vitest';

import {
  interactiveEnvelopeIsSubset,
  validateInteractiveEnvelope,
  type L99InteractiveAuthorityEnvelope,
} from '../l99InteractiveCapabilityPolicy.js';

function envelope(
  overrides: Partial<L99InteractiveAuthorityEnvelope> = {},
): L99InteractiveAuthorityEnvelope {
  return {
    capability: 'browser.open',
    targetPatterns: ['https://example.com'],
    allowedOperations: ['open'],
    externalMutation: false,
    requiresFounderReceipt: false,
    requiresPlaywrightProof: false,
    fingerprints: {
      inputFingerprint: null,
      environmentFingerprint: null,
      outputFingerprint: null,
    },
    sandboxIsolation: null,
    expiresAt: null,
    ...overrides,
  };
}

describe('L99 interactive capability policy', () => {
  it('does not allow a browser-open grant to widen into an external mutation', () => {
    const parent = envelope();
    const child = envelope({
      capability: 'browser.external_mutation',
      allowedOperations: ['submit'],
      externalMutation: true,
      requiresFounderReceipt: true,
      requiresPlaywrightProof: true,
    });

    expect(interactiveEnvelopeIsSubset(child, parent)).toBe(false);
  });

  it('requires an explicit terminal command allowlist', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'terminal.exec',
          allowedOperations: [],
        }),
      ),
    ).toContain('terminal.exec requires an explicit command allowlist');
  });

  it('keeps browser.open mutation-free', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          externalMutation: true,
        }),
      ),
    ).toContain('browser.open cannot carry external mutation authority');
  });

  it('requires founder receipt for browser external mutation', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'browser.external_mutation',
          allowedOperations: ['submit'],
          externalMutation: true,
          requiresFounderReceipt: false,
          requiresPlaywrightProof: true,
        }),
      ),
    ).toContain('browser external mutation requires a founder receipt');
  });

  it('requires Playwright proof for interactive browser authority', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'browser.interact',
          allowedOperations: ['click'],
          requiresPlaywrightProof: false,
        }),
      ),
    ).toContain('interactive browser authority requires Playwright proof');
  });

  it('allows a narrower browser read scope to remain inside a wider read scope', () => {
    const parent = envelope({
      capability: 'browser.read',
      targetPatterns: ['https://example.com'],
      allowedOperations: ['open', 'read'],
    });
    const child = envelope({
      capability: 'browser.read',
      targetPatterns: ['https://example.com'],
      allowedOperations: ['read'],
    });

    expect(interactiveEnvelopeIsSubset(child, parent)).toBe(true);
  });

  it('requires an explicit sandbox isolation envelope', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.create',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['create'],
          sandboxIsolation: null,
        }),
      ),
    ).toContain('sandbox capability requires an explicit isolation envelope');
  });

  it('requires exact input and environment fingerprints for sandbox execution', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.exec',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['pytest'],
          sandboxIsolation: {
            networkAccess: false,
            secretsAccess: false,
            productionAccess: false,
            persistentStorage: false,
          },
        }),
      ),
    ).toContain('sandbox.exec requires exact input and environment fingerprints');
  });

  it('requires founder authority for sandbox network, secrets, or production access', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.exec',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['pytest'],
          fingerprints: {
            inputFingerprint: 'input:abc',
            environmentFingerprint: 'env:def',
            outputFingerprint: null,
          },
          sandboxIsolation: {
            networkAccess: true,
            secretsAccess: false,
            productionAccess: false,
            persistentStorage: false,
          },
          requiresFounderReceipt: false,
        }),
      ),
    ).toContain('sandbox ambient authority requires a founder receipt');
  });

  it('requires founder receipt and exact output fingerprint before sandbox export', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.export',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['export'],
          externalMutation: true,
          requiresFounderReceipt: true,
          sandboxIsolation: {
            networkAccess: false,
            secretsAccess: false,
            productionAccess: false,
            persistentStorage: false,
          },
        }),
      ),
    ).toContain('sandbox.export requires founder receipt and exact output fingerprint');
  });

  it('requires founder receipt before destroying a sandbox', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.destroy',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['destroy'],
          sandboxIsolation: {
            networkAccess: false,
            secretsAccess: false,
            productionAccess: false,
            persistentStorage: false,
          },
          requiresFounderReceipt: false,
        }),
      ),
    ).toContain('sandbox.destroy requires a founder receipt');
  });
});
