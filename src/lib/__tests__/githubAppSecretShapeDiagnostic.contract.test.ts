import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
    expect(workflow).toContain('current_main="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq .object.sha)"');
    expect(workflow).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
    expect(workflow).not.toContain('git rev-parse HEAD');
  });

  it('scopes the production GitHub App credential pair to the classification step only', () => {
    const classifyMarker = '      - name: Classify private-key shape without exposing secret material';
    const retainMarker = '      - name: Retain secret-safe diagnostic receipt';
    const classifyStart = workflow.indexOf(classifyMarker);
    const retainStart = workflow.indexOf(retainMarker);

    expect(classifyStart).toBeGreaterThan(-1);
    expect(retainStart).toBeGreaterThan(classifyStart);

    const beforeClassification = workflow.slice(0, classifyStart);
    const classificationStep = workflow.slice(classifyStart, retainStart);
    const afterClassification = workflow.slice(retainStart);
    const secretMappings = [
      'GITHUB_APP_ID: ${{ secrets.APP_ID }}',
      'GITHUB_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}',
    ];

    expect(workflow).toContain('environment: production');
    for (const mapping of secretMappings) {
      expect(beforeClassification).not.toContain(mapping);
      expect(classificationStep).toContain(mapping);
      expect(afterClassification).not.toContain(mapping);
    }
    expect(workflow).not.toContain('secrets.GITHUB_APP_ID');
    expect(workflow).not.toContain('secrets.GITHUB_PRIVATE_KEY');
  });

  it('classifies literal escaped-newline PEM transport before raw PEM', () => {
    const escapedBranch = "} else if (trimmed.includes('\\\\n') || trimmed.includes('\\\\r\\\\n')) {";
    const rawBranch = "} else if (trimmed.startsWith('-----BEGIN')) {";
    const escapedIndex = workflow.indexOf(escapedBranch);
    const rawIndex = workflow.indexOf(rawBranch);

    expect(escapedIndex).toBeGreaterThan(-1);
    expect(rawIndex).toBeGreaterThan(-1);
    expect(escapedIndex).toBeLessThan(rawIndex);
    expect(workflow.slice(escapedIndex, rawIndex)).toContain("transportClass = 'escaped-newline-pem';");
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

  it('keeps production-secret execution off candidate-controlled code and pull-request events', () => {
    expect(workflow).toContain('issue_comment:');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('push:');
    expect(workflow).not.toContain('workflow_dispatch:');
    expect(workflow).not.toContain('actions/checkout');
    expect(workflow).not.toContain('uses: actions/checkout');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('permissions:');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('issues: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('issues: write');
    expect(workflow).not.toContain('pull-requests: write');
    expect(workflow).not.toContain('actions: write');
  });
});
