import { describe, expect, it } from 'vitest';

import {
  interactiveEnvelopeIsSubset,
  validateInteractiveEnvelope,
  type L99InteractiveAuthorityEnvelope,
} from '../l99InteractiveCapabilityPolicy.js';

const INPUT_SHA = 'a'.repeat(64);
const ENV_SHA = 'b'.repeat(64);
const OUTPUT_SHA = 'c'.repeat(64);

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
  it('fails closed on unknown runtime capabilities and unknown authority fields', () => {
    expect(
      validateInteractiveEnvelope({
        ...envelope(),
        capability: 'root.exec',
      }),
    ).toEqual(['interactive authority envelope shape is invalid']);

    expect(
      validateInteractiveEnvelope({
        ...envelope(),
        hiddenAuthority: true,
      }),
    ).toEqual(['interactive authority envelope shape is invalid']);
  });

  it('fails closed on malformed nested fingerprint or isolation shapes', () => {
    expect(
      validateInteractiveEnvelope({
        ...envelope(),
        fingerprints: {
          inputFingerprint: null,
          environmentFingerprint: null,
          outputFingerprint: null,
          permission: 'admin',
        },
      }),
    ).toEqual(['interactive authority envelope shape is invalid']);

    expect(
      validateInteractiveEnvelope({
        ...envelope({
          capability: 'sandbox.read',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['read'],
        }),
        sandboxIsolation: {
          networkAccess: false,
          secretsAccess: false,
          productionAccess: false,
          persistentStorage: 'false',
        },
      }),
    ).toEqual(['interactive authority envelope shape is invalid']);
  });

  it('requires explicit non-blank targets and operations', () => {
    const errors = validateInteractiveEnvelope(
      envelope({
        targetPatterns: [],
        allowedOperations: [],
      }),
    );

    expect(errors).toContain('interactive authority requires at least one non-blank target pattern');
    expect(errors).toContain('interactive authority requires at least one non-blank allowed operation');
  });

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

  it('rejects raw shell text, shell-like ids, and path-like terminal operation ids', () => {
    for (const operation of ['git status', 'bash', 'bash:run', '../../bin/sh']) {
      expect(
        validateInteractiveEnvelope(
          envelope({
            capability: 'terminal.exec',
            allowedOperations: [operation],
          }),
        ),
      ).toContain('terminal.exec allowlist must contain bounded operation ids, not arbitrary shell commands');
    }
  });

  it('accepts bounded terminal operation ids', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'terminal.exec',
          allowedOperations: ['git:status', 'test:unit', 'verify.playwright'],
        }),
      ),
    ).not.toContain('terminal.exec allowlist must contain bounded operation ids, not arbitrary shell commands');
  });

  it('keeps browser.open mutation-free', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          externalMutation: true,
          requiresFounderReceipt: true,
        }),
      ),
    ).toContain('browser external mutation must use browser.external_mutation');
  });

  it('prevents browser.interact from laundering external mutation authority', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'browser.interact',
          allowedOperations: ['click'],
          externalMutation: true,
          requiresFounderReceipt: true,
          requiresPlaywrightProof: true,
        }),
      ),
    ).toContain('browser external mutation must use browser.external_mutation');
  });

  it('requires browser.external_mutation to be explicitly classified as mutation', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'browser.external_mutation',
          allowedOperations: ['submit'],
          externalMutation: false,
          requiresFounderReceipt: true,
          requiresPlaywrightProof: true,
        }),
      ),
    ).toContain('browser.external_mutation must be classified as an external mutation');
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

  it('requires founder receipt for any envelope explicitly carrying external mutation', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'terminal.exec',
          targetPatterns: ['terminal://repo'],
          allowedOperations: ['git:push'],
          externalMutation: true,
          requiresFounderReceipt: false,
        }),
      ),
    ).toContain('external mutation requires a founder receipt');
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

  it('rejects invalid or expired expiry timestamps', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({ expiresAt: 'not-a-timestamp' }),
      ),
    ).toContain('expiresAt must be a valid timestamp');

    expect(
      validateInteractiveEnvelope(
        envelope({ expiresAt: '2000-01-01T00:00:00Z' }),
      ),
    ).toContain('expiresAt must be in the future');
  });

  it('requires cryptographic sha256 fingerprints rather than arbitrary labels', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          fingerprints: {
            inputFingerprint: 'input:abc',
            environmentFingerprint: ENV_SHA,
            outputFingerprint: null,
          },
        }),
      ),
    ).toContain('inputFingerprint must be a 64-hex sha256 fingerprint');

    expect(
      validateInteractiveEnvelope(
        envelope({
          fingerprints: {
            inputFingerprint: INPUT_SHA,
            environmentFingerprint: ENV_SHA,
            outputFingerprint: OUTPUT_SHA,
          },
        }),
      ),
    ).not.toContain('inputFingerprint must be a 64-hex sha256 fingerprint');
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

  it('rejects sandbox isolation authority on non-sandbox capabilities', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          sandboxIsolation: {
            networkAccess: false,
            secretsAccess: false,
            productionAccess: false,
            persistentStorage: false,
          },
        }),
      ),
    ).toContain('non-sandbox capability cannot carry sandbox isolation authority');
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

  it('requires founder authority for sandbox network, secrets, production, or persistence access', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.exec',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['pytest'],
          fingerprints: {
            inputFingerprint: INPUT_SHA,
            environmentFingerprint: ENV_SHA,
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

    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.read',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['read'],
          sandboxIsolation: {
            networkAccess: false,
            secretsAccess: false,
            productionAccess: false,
            persistentStorage: true,
          },
          requiresFounderReceipt: false,
        }),
      ),
    ).toContain('sandbox ambient authority requires a founder receipt');
  });

  it('requires sandbox export to be classified as an external mutation', () => {
    expect(
      validateInteractiveEnvelope(
        envelope({
          capability: 'sandbox.export',
          targetPatterns: ['sandbox://job-1'],
          allowedOperations: ['export'],
          externalMutation: false,
          requiresFounderReceipt: true,
          fingerprints: {
            inputFingerprint: INPUT_SHA,
            environmentFingerprint: ENV_SHA,
            outputFingerprint: OUTPUT_SHA,
          },
          sandboxIsolation: {
            networkAccess: false,
            secretsAccess: false,
            productionAccess: false,
            persistentStorage: false,
          },
        }),
      ),
    ).toContain('sandbox.export must be classified as an external mutation');
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
