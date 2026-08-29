import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDeterministicReviewRules } from '../../review/deterministicReviewProducer.js';

const reviewWorkflow = readFileSync(
  new URL('../../../.github/workflows/deterministic-review-core-advisory.yml', import.meta.url),
  'utf8',
);

describe('trusted review witness command contract', () => {
  it('accepts only the founder command on governance issue 418', () => {
    expect(reviewWorkflow).toContain('issue_comment:');
    expect(reviewWorkflow).toContain("github.event_name == 'issue_comment'");
    expect(reviewWorkflow).toContain('github.event.issue.number == 418');
    expect(reviewWorkflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(reviewWorkflow).toContain("startsWith(github.event.comment.body, '/review-witness ')");
    expect(reviewWorkflow).toContain(
      'Expected exactly: /review-witness <pull-request-number> <40-char-current-main-sha>',
    );
    expect(reviewWorkflow).toContain("re.fullmatch(r'[1-9][0-9]{0,8}', pr_number)");
    expect(reviewWorkflow).toContain("re.fullmatch(r'[0-9a-f]{40}', main_sha)");
  });

  it('fails closed unless the command names exact current main and an open PR targeting it', () => {
    expect(reviewWorkflow).toContain('/git/ref/heads/main');
    expect(reviewWorkflow).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
    expect(reviewWorkflow).toContain('pulls/${PR_NUMBER}');
    expect(reviewWorkflow).toContain("test \"$state\" = 'open'");
    expect(reviewWorkflow).toContain("test \"$base_ref\" = 'main'");
    expect(reviewWorkflow).toContain('test "$base_sha" = "$EXPECTED_MAIN_SHA"');
  });

  it('scopes workflow-dispatch write authority to the founder command job', () => {
    const commandJob = reviewWorkflow.split('  dispatch-trusted-witness:')[1]?.split('  publish-trusted-witness:')[0] ?? '';
    expect(commandJob).toContain('actions: write');
    expect(commandJob).toContain('contents: read');
    expect(commandJob).toContain('issues: read');
    expect(commandJob).toContain('pull-requests: read');
    expect(commandJob).not.toContain('contents: write');
    expect(commandJob).not.toContain('issues: write');
    expect(commandJob).not.toContain('pull-requests: write');
  });

  it('hard-codes the trusted witness workflow and cannot select deploy or provider mutation targets', () => {
    expect(reviewWorkflow).toContain(
      '/actions/workflows/deterministic-review-core-advisory.yml/dispatches',
    );
    expect(reviewWorkflow).toContain('--arg ref main');
    expect(reviewWorkflow).toContain('--argjson pr "$PR_NUMBER"');
    expect(reviewWorkflow).toContain("'{ref:$ref, inputs:{pull_request_number:$pr}}'");

    expect(reviewWorkflow).not.toContain('/actions/workflows/deploy.yml/dispatches');
    expect(reviewWorkflow).not.toContain('/actions/workflows/worker-reconcile.yml/dispatches');
    expect(reviewWorkflow).not.toContain('supabase');
    expect(reviewWorkflow).not.toContain('wrangler');
    expect(reviewWorkflow).not.toContain('CLOUDFLARE_');
    expect(reviewWorkflow).not.toContain('SUPABASE_');
  });

  it('leaves review publication and provider readback inside trusted current-main code', () => {
    expect(reviewWorkflow).toContain('workflow_dispatch:');
    expect(reviewWorkflow).toContain('pull_request_number:');
    expect(reviewWorkflow).toContain('required: true');
    expect(reviewWorkflow).toContain('type: number');
    expect(reviewWorkflow).toContain(
      "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'",
    );
    expect(reviewWorkflow).toContain('environment: production');
    expect(reviewWorkflow).toContain('EXPECTED_TRUSTED_MAIN_SHA: ${{ github.sha }}');
    expect(reviewWorkflow).toContain('GITHUB_APP_ID: ${{ secrets.GITHUB_APP_ID }}');
    expect(reviewWorkflow).toContain('GITHUB_PRIVATE_KEY: ${{ secrets.GITHUB_PRIVATE_KEY }}');
    expect(reviewWorkflow).toContain('test "$EXPECTED_TRUSTED_MAIN_SHA" = "$current_main"');
    expect(reviewWorkflow).toContain('node scripts/publish-deterministic-review-witness.mjs');
    expect(reviewWorkflow).toContain('Re-read trusted main after publication');
  });

  it('keeps the command inside an existing P1 deterministic-review trust root', () => {
    const findings = evaluateDeterministicReviewRules([{
      path: '.github/workflows/deterministic-review-core-advisory.yml',
      status: 'modified',
      additions: 1,
      deletions: 1,
      patch: '@@ -1 +1 @@\n-old\n+new',
    }]);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'trust-root-self-modification',
        severity: 'P1',
        path: '.github/workflows/deterministic-review-core-advisory.yml',
      }),
    ]));
  });

  it('states that dispatch is evidence only, never merge or release authority', () => {
    expect(reviewWorkflow).toContain(
      'Verdict, Founder Final, merge, deploy, provider, database, secret, and publication authority: none granted by this command',
    );
  });
});
