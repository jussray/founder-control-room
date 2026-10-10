import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/cloudflare-deploy-token-shape-diagnostic.yml', import.meta.url),
  'utf8',
);

describe('Cloudflare canonical deploy-token shape diagnostic', () => {
  it('is founder-bound, issue-bound, production-scoped, and exact-current-main only', () => {
    expect(workflow).toContain('github.event.issue.number == 247');
    expect(workflow).toContain('github.event.comment.user.id == 286642846');
    expect(workflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(workflow).toContain(
      "startsWith(github.event.comment.body, '/diagnose-fcr-cloudflare-deploy-token ')",
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain(
      'Expected exactly: /diagnose-fcr-cloudflare-deploy-token <40-char-current-main-sha> <approval-reference>',
    );
    expect(workflow).toContain(
      'current_main="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq .object.sha)"',
    );
    expect(workflow).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
  });

  it('keeps the production credential scoped only to the shape-classification step', () => {
    expect(workflow).toContain(
      '      - name: Classify deploy-token shape without exposing secret material',
    );
    expect(workflow).toContain(
      '          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}',
    );
    expect(workflow).not.toMatch(
      /^    env:\n(?:.|\n)*CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/m,
    );
    expect(workflow).not.toContain('actions/checkout');
  });

  it('emits only non-reconstructable shape facts and never prints secret material', () => {
    for (const field of [
      'credentialType',
      'present',
      'hasBearerPrefix',
      'hasWhitespace',
      'hasLeadingOrTrailingWhitespace',
      'hasNonAscii',
      'hasWrappingQuote',
      'looksLikeAssignment',
      'headerSafe',
    ]) {
      expect(workflow).toContain(field);
    }

    expect(workflow).toContain("schema: 'fcr/cloudflare-deploy-token-shape@v1'");
    expect(workflow).toContain('providerAuthenticationAttempted: false');
    expect(workflow).toContain('providerMutationAttempted: false');
    expect(workflow).toContain('repositoryCodeExecutedWithSecret: false');
    expect(workflow).toContain('secretMaterialLogged: false');
    expect(workflow).toContain('reconstructableSecretMetadataLogged: false');

    expect(workflow).not.toContain('console.log(token)');
    expect(workflow).not.toContain('console.error(token)');
    expect(workflow).not.toContain('print(token)');
    expect(workflow).not.toContain('echo "$CLOUDFLARE_API_TOKEN"');
    expect(workflow).not.toContain('createHash');
    expect(workflow).not.toContain('sha256');
    expect(workflow).not.toContain('token.length}`');
  });

  it('cannot authenticate to or mutate Cloudflare', () => {
    expect(workflow).not.toContain('api.cloudflare.com');
    expect(workflow).not.toContain('wrangler');
    expect(workflow).not.toContain('curl ');
    expect(workflow).not.toContain('Authorization:');
    expect(workflow).not.toContain('Bearer ${');
    expect(workflow).not.toContain('secret put');
    expect(workflow).not.toContain('deploy --config');
  });

  it('retains a sanitized receipt even when the shape check fails closed', () => {
    expect(workflow).toContain('if (!headerSafe) process.exitCode = 1;');
    expect(workflow).toContain('      - name: Retain secret-safe diagnostic receipt');
    expect(workflow).toContain('        if: always()');
    expect(workflow).toContain(
      'uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    );
    expect(workflow).toContain('artifacts/cloudflare-deploy-token-shape.json');
  });
});
