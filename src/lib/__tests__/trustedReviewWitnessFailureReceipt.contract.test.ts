import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const witnessScript = readFileSync(
  new URL('../../../scripts/publish-deterministic-review-witness.mjs', import.meta.url),
  'utf8',
);
const reviewWorkflow = readFileSync(
  new URL('../../../.github/workflows/deterministic-review-core-advisory.yml', import.meta.url),
  'utf8',
);

describe('trusted deterministic review witness failure receipt contract', () => {
  it('cryptographically preflights the server-owned GitHub App credential before provider review', () => {
    expect(witnessScript).toContain(
      'import { createGitHubAppJwt } from "../dist/providers/githubAppAuth.js";',
    );
    expect(witnessScript).toContain('stage = "credential_preflight";');
    expect(witnessScript).toContain('const appId = required("GITHUB_APP_ID");');
    expect(witnessScript).toContain('const privateKey = required("GITHUB_PRIVATE_KEY");');
    expect(witnessScript).toContain('createGitHubAppJwt(appId, privateKey);');

    const preflightIndex = witnessScript.indexOf('createGitHubAppJwt(appId, privateKey);');
    const providerIndex = witnessScript.indexOf('const provider = providerForProject(PROJECT);');
    expect(preflightIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeGreaterThan(preflightIndex);
  });

  it('retains a sanitized failure receipt and then rethrows so the witness remains fail-closed', () => {
    expect(witnessScript).toContain('status: "failed"');
    expect(witnessScript).toContain('failure: {');
    expect(witnessScript).toContain('stage,');
    expect(witnessScript).toContain('reasonCode: failure.reasonCode');
    expect(witnessScript).toContain('summary: failure.summary');
    expect(witnessScript).toContain('throw error;');

    expect(witnessScript).not.toContain('message: error.message');
    expect(witnessScript).not.toContain('error.stack');
    expect(witnessScript).not.toContain('privateKey:');
  });

  it('classifies malformed App credentials without copying secret material into the receipt', () => {
    expect(witnessScript).toContain('GITHUB_APP_PRIVATE_KEY_INVALID');
    expect(witnessScript).toContain('GITHUB_APP_ID_INVALID');
    expect(witnessScript).toContain(
      'GitHub App private key failed local cryptographic preflight.',
    );
    expect(witnessScript).toContain(
      'GitHub App identifier failed local credential preflight.',
    );
  });

  it('keeps artifact retention unconditional and treats a missing receipt as an error', () => {
    const publishJob = reviewWorkflow.split('  publish-trusted-witness:')[1]?.split('  reconcile-fcr-governance:')[0] ?? '';
    const retention = publishJob.split('- name: Retain deterministic review receipt and provider readback')[1] ?? '';

    expect(retention).toContain('if: always()');
    expect(retention).toContain('path: artifacts/deterministic-review-witness.json');
    expect(retention).toContain('if-no-files-found: error');
  });
});
