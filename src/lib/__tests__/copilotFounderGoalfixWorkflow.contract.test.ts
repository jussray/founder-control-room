import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const extensionSource = readFileSync(
  new URL('../../../.github/extensions/founder-goalfix-gate/extension.mjs', import.meta.url),
  'utf8',
);

describe('GitHub Copilot founder-goalfix dynamic workflow contract', () => {
  it('registers the bounded dynamic workflow through the GitHub Copilot extension SDK', () => {
    expect(extensionSource).toContain('defineWorkflow');
    expect(extensionSource).toContain('joinSession');
    expect(extensionSource).toContain('name: "founder-goalfix-gate"');
    expect(extensionSource).toContain('workflows: [founderGoalfixGate]');
  });

  it('keeps every workflow-owned council agent tool-less and non-inferred', () => {
    expect(extensionSource.match(/tools:\s*\[\]/g)).toHaveLength(5);
    expect(extensionSource.match(/infer: false/g)).toHaveLength(5);
    expect(extensionSource).not.toContain('requestedEnvironmentVariables');
  });

  it('fails closed on identity, partial council, synthesis, and authority', () => {
    expect(extensionSource).toContain('exact_identity_required');
    expect(extensionSource).toContain('incomplete_council');
    expect(extensionSource).toContain('synthesis_failed');
    expect(extensionSource).toContain('SUPPLIED_NOT_VERIFIED_BY_WORKFLOW');
    expect(extensionSource).toContain('NOT_GRANTED_BY_WORKFLOW');
    expect(extensionSource).toContain('execution_authority: false');
    expect(extensionSource).toContain('merge_permitted: false');
    expect(extensionSource).toContain('deploy_permitted: false');
    expect(extensionSource).toContain('consensus_is_approval: false');
  });

  it('hard-bounds the advisory fan-out without inventing a credit budget', () => {
    expect(extensionSource).toContain('maxConcurrentSubagents: 4');
    expect(extensionSource).toContain('maxTotalSubagents: 5');
    expect(extensionSource).not.toContain('maxAiCredits');
  });
});
