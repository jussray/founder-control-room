import { describe, expect, it } from 'vitest';

import {
  interactiveEnvelopeIsSubset,
  type L99InteractiveAuthorityEnvelope,
} from '../l99InteractiveCapabilityPolicy.js';

const INPUT_SHA = 'a'.repeat(64);
const ENV_SHA = 'b'.repeat(64);
const OUTPUT_SHA = 'c'.repeat(64);
const CHANGED_SHA = 'd'.repeat(64);

const parent: L99InteractiveAuthorityEnvelope = {
  capability: 'browser.external_mutation',
  targetPatterns: ['https://example.com'],
  allowedOperations: ['open', 'read', 'click', 'submit'],
  externalMutation: true,
  requiresFounderReceipt: true,
  requiresPlaywrightProof: true,
  fingerprints: {
    inputFingerprint: null,
    environmentFingerprint: null,
    outputFingerprint: null,
  },
  sandboxIsolation: null,
  expiresAt: '2999-08-20T00:00:00Z',
};

describe('interactive authority monotonicity', () => {
  it('requires a separate grant when the capability changes', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          capability: 'browser.read',
          allowedOperations: ['read'],
          externalMutation: false,
          requiresFounderReceipt: false,
          requiresPlaywrightProof: false,
        },
        parent,
      ),
    ).toBe(false);
  });

  it('rejects same-family capability laundering', () => {
    const sandboxParent: L99InteractiveAuthorityEnvelope = {
      ...parent,
      capability: 'sandbox.export',
      targetPatterns: ['sandbox://job-1'],
      allowedOperations: ['pytest'],
      externalMutation: true,
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
    };

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...sandboxParent,
          capability: 'sandbox.exec',
          externalMutation: false,
        },
        sandboxParent,
      ),
    ).toBe(false);
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

  it('rejects dropping a founder-receipt constraint', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          requiresFounderReceipt: false,
        },
        parent,
      ),
    ).toBe(false);
  });

  it('rejects dropping a Playwright-proof constraint', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          requiresPlaywrightProof: false,
        },
        parent,
      ),
    ).toBe(false);
  });

  it('rejects downgrading external-mutation classification on the same capability', () => {
    const terminalParent: L99InteractiveAuthorityEnvelope = {
      ...parent,
      capability: 'terminal.exec',
      targetPatterns: ['terminal://repo'],
      allowedOperations: ['provider:deploy'],
      externalMutation: true,
      requiresFounderReceipt: true,
      requiresPlaywrightProof: false,
      expiresAt: null,
    };

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...terminalParent,
          externalMutation: false,
        },
        terminalParent,
      ),
    ).toBe(false);
  });

  it('rejects clearing or extending a bounded expiry', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          expiresAt: null,
        },
        parent,
      ),
    ).toBe(false);

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          expiresAt: '2999-08-21T00:00:00Z',
        },
        parent,
      ),
    ).toBe(false);
  });

  it('allows an earlier expiry inside the same capability', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          expiresAt: '2999-08-19T12:00:00Z',
        },
        parent,
      ),
    ).toBe(true);
  });

  it('rejects an already-expired child even when it is earlier than the parent', () => {
    expect(
      interactiveEnvelopeIsSubset(
        {
          ...parent,
          expiresAt: '2000-01-01T00:00:00Z',
        },
        parent,
      ),
    ).toBe(false);
  });

  it('rejects cross-family capability laundering', () => {
    const terminalParent: L99InteractiveAuthorityEnvelope = {
      ...parent,
      capability: 'terminal.exec',
      targetPatterns: ['shared-target'],
      allowedOperations: ['read'],
      externalMutation: false,
      requiresFounderReceipt: false,
      requiresPlaywrightProof: false,
      expiresAt: null,
    };

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...terminalParent,
          capability: 'browser.read',
        },
        terminalParent,
      ),
    ).toBe(false);
  });

  it('rejects a changed bound input fingerprint', () => {
    const fingerprintParent: L99InteractiveAuthorityEnvelope = {
      ...parent,
      capability: 'sandbox.exec',
      targetPatterns: ['sandbox://job-1'],
      allowedOperations: ['pytest'],
      externalMutation: false,
      requiresFounderReceipt: false,
      requiresPlaywrightProof: false,
      fingerprints: {
        inputFingerprint: INPUT_SHA,
        environmentFingerprint: ENV_SHA,
        outputFingerprint: null,
      },
      sandboxIsolation: {
        networkAccess: false,
        secretsAccess: false,
        productionAccess: false,
        persistentStorage: false,
      },
    };

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...fingerprintParent,
          fingerprints: {
            ...fingerprintParent.fingerprints,
            inputFingerprint: CHANGED_SHA,
          },
        },
        fingerprintParent,
      ),
    ).toBe(false);
  });

  it('allows a downstream stage to bind a previously unknown output fingerprint', () => {
    const sandboxParent: L99InteractiveAuthorityEnvelope = {
      ...parent,
      capability: 'sandbox.snapshot',
      targetPatterns: ['sandbox://job-1'],
      allowedOperations: ['snapshot'],
      externalMutation: false,
      requiresFounderReceipt: false,
      requiresPlaywrightProof: false,
      fingerprints: {
        inputFingerprint: INPUT_SHA,
        environmentFingerprint: ENV_SHA,
        outputFingerprint: null,
      },
      sandboxIsolation: {
        networkAccess: false,
        secretsAccess: false,
        productionAccess: false,
        persistentStorage: false,
      },
    };

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...sandboxParent,
          fingerprints: {
            ...sandboxParent.fingerprints,
            outputFingerprint: OUTPUT_SHA,
          },
        },
        sandboxParent,
      ),
    ).toBe(true);
  });

  it('rejects sandbox authority widening to network access', () => {
    const sandboxParent: L99InteractiveAuthorityEnvelope = {
      ...parent,
      capability: 'sandbox.exec',
      targetPatterns: ['sandbox://job-1'],
      allowedOperations: ['pytest'],
      externalMutation: false,
      requiresFounderReceipt: false,
      requiresPlaywrightProof: false,
      fingerprints: {
        inputFingerprint: INPUT_SHA,
        environmentFingerprint: ENV_SHA,
        outputFingerprint: null,
      },
      sandboxIsolation: {
        networkAccess: false,
        secretsAccess: false,
        productionAccess: false,
        persistentStorage: false,
      },
    };

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...sandboxParent,
          sandboxIsolation: {
            ...sandboxParent.sandboxIsolation!,
            networkAccess: true,
          },
          requiresFounderReceipt: true,
        },
        sandboxParent,
      ),
    ).toBe(false);
  });

  it('rejects stripping a sandbox isolation envelope', () => {
    const sandboxParent: L99InteractiveAuthorityEnvelope = {
      ...parent,
      capability: 'sandbox.read',
      targetPatterns: ['sandbox://job-1'],
      allowedOperations: ['read'],
      externalMutation: false,
      requiresFounderReceipt: false,
      requiresPlaywrightProof: false,
      sandboxIsolation: {
        networkAccess: false,
        secretsAccess: false,
        productionAccess: false,
        persistentStorage: false,
      },
      expiresAt: null,
    };

    expect(
      interactiveEnvelopeIsSubset(
        {
          ...sandboxParent,
          sandboxIsolation: null,
        },
        sandboxParent,
      ),
    ).toBe(false);
  });
});
