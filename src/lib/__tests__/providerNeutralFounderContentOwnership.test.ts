import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const coreAuthorityConsumers = [
  '../founderContentApprovalStore.ts',
  '../firstPartyFounderContentExecutor.ts',
  '../temporallyGovernedFounderContentExecutor.ts',
] as const;

const providerNeutralAuthorityPath =
  '../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';
const zapierCompatibilityAuthorityPath =
  '../../tools/zapier/founder-content-authorization-contract.cjs';

describe('provider-neutral founder-content authority ownership', () => {
  it.each(coreAuthorityConsumers)(
    '%s imports the canonical authority directly instead of through Zapier compatibility',
    (relativePath) => {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).toContain(providerNeutralAuthorityPath);
      expect(source).not.toContain(zapierCompatibilityAuthorityPath);
    },
  );

  it('retains the Zapier compatibility wrapper for provider-specific callers', () => {
    const source = readFileSync(
      new URL('../../../tools/zapier/founder-content-authorization-contract.cjs', import.meta.url),
      'utf8',
    );
    expect(source).toContain(
      "module.exports = require('../founder-content-contracts/founder-content-authorization-contract.cjs');",
    );
  });
});
