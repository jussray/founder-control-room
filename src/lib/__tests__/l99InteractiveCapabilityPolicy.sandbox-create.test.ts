import { describe, expect, it } from 'vitest';

import {
  validateInteractiveEnvelope,
  type L99SandboxIsolation,
} from '../l99InteractiveCapabilityPolicy.js';

const ZERO_ISOLATION: L99SandboxIsolation = {
  networkAccess: false,
  secretsAccess: false,
  productionAccess: false,
  persistentStorage: false,
};

describe('L99 sandbox.create zero ambient authority', () => {
  it('accepts sandbox creation only with zero ambient authority', () => {
    expect(validateInteractiveEnvelope({
      capability: 'sandbox.create',
      targetPatterns: ['sandbox://job-1'],
      allowedOperations: ['create'],
      externalMutation: false,
      requiresFounderReceipt: false,
      requiresPlaywrightProof: false,
      fingerprints: {
        inputFingerprint: null,
        environmentFingerprint: null,
        outputFingerprint: null,
      },
      sandboxIsolation: ZERO_ISOLATION,
      expiresAt: null,
    })).not.toContain('sandbox.create must start with zero ambient authority');
  });

  for (const authority of [
    'networkAccess',
    'secretsAccess',
    'productionAccess',
    'persistentStorage',
  ] as const) {
    it(`rejects ${authority} during sandbox creation even with founder receipt`, () => {
      expect(validateInteractiveEnvelope({
        capability: 'sandbox.create',
        targetPatterns: ['sandbox://job-1'],
        allowedOperations: ['create'],
        externalMutation: false,
        requiresFounderReceipt: true,
        requiresPlaywrightProof: false,
        fingerprints: {
          inputFingerprint: null,
          environmentFingerprint: null,
          outputFingerprint: null,
        },
        sandboxIsolation: {
          ...ZERO_ISOLATION,
          [authority]: true,
        },
        expiresAt: null,
      })).toContain('sandbox.create must start with zero ambient authority');
    });
  }
});
