import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDeterministicReviewRules } from '../../review/deterministicReviewProducer.js';

const workflowPath = '.github/workflows/github-app-secret-shape-diagnostic.yml';
const workflow = readFileSync(
  new URL(`../../../${workflowPath}`, import.meta.url),
  'utf8',
);

describe('GitHub App secret-shape diagnostic contract', () => {
  it('binds execution to issue 418, immutable founder identity, and exact current main', () => {
    expect(workflow).toContain('github.event.issue.number == 418');
    expect(workflow).toContain('github.event.comment.user.id == 286642846');
    expect(workflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(workflow).toContain("startsWith(github.event.comment.body, '/diagnose-fcr-github-app-key ')");
    expect(workflow).toContain(
      'Expected exactly: /diagnose-fcr-github-app-key <40-char-current-main-sha> <approval-reference>',
    );
    expect(workflow).toContain('test "$actual" = "$EXPECTED_MAIN_SHA"');
    expect(workflow).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
  });

  it('reads only the existing production GitHub App credential pair', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('GITHUB_APP_ID: ${{ secrets.APP_ID }}');
    expect(workflow).toContain('GITHUB_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}');
    expect(workflow).not.toContain('secrets.GITHUB_APP_ID');
    expect(workflow).not.toContain('secrets.GITHUB_PRIVATE_KEY');
  });

  it('emits only non-reconstructable shape classifications', () => {
    expect(workflow).toContain("schema: 'fcr/github-app-secret-shape@v1'");
    expect(workflow).toContain('appIdNumeric,');
    expect(workflow).toContain('present,');
    expect(workflow).toContain('recognizedTransport,');
    expect(workflow).toContain('transportClass,');
    expect(workflow).toContain('pemBoundary,');
    expect(workflow).toContain('rsaParse,');
    expect(workflow).toContain('secretMaterialLogged: false');
    expect(workflow).toContain('reconstructableSecretMetadataLogged: false');

    expect(workflow).not.toContain('secret.length,');
    expect(workflow).not.toContain('normalized.length');
    expect(workflow).not.toContain('createHash');
    expect(workflow).not.toContain('digest');
    expect(workflow).not.toContain('console.log(secret');
    expect(workflow).not.toContain('console.log(normalized');
    expect(workflow).not.toContain('console.log(process.env.GITHUB_PRIVATE_KEY');
  });

  it('performs local cryptographic parsing but no provider authentication or mutation', () => {
    expect(workflow).toContain("import { createPrivateKey } from 'node:crypto';");
    expect(workflow).toContain("createPrivateKey({ key: normalized, format: 'pem' })");
    expect(workflow).toContain("key.asymmetricKeyType === 'rsa'");
    expect(workflow).toContain('providerAuthenticationAttempted: false');
    expect(workflow).toContain('providerMutationAttempted: false');
    expect(workflow).not.toContain('getGitHubInstallationToken');
    expect(workflow).not.toContain('providerForProject');
    expect(workflow).not.toContain('applyBranchRuleset');
    expect(workflow).not.toContain('/rulesets');
  });

  it('fails closed when the App ID or private-key shape is not locally valid', () => {
    expect(workflow).toContain('if (!appIdNumeric || !present || !recognizedTransport || !pemBoundary || !rsaParse)');
    expect(workflow).toContain('process.exitCode = 1;');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('artifacts/github-app-secret-shape.json');
  });

  it('keeps the diagnostic workflow classified as a P1 trust-root change', () => {
    const findings = evaluateDeterministicReviewRules([{
      path: workflowPath,
      status: 'added',
      additions: 1,
      deletions: 0,
      patch: '@@ -0,0 +1 @@\n+name: GitHub App Secret Shape Diagnostic',
    }]);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'trust-root-self-modification',
        severity: 'P1',
        path: workflowPath,
      }),
    ]));
  });
});
