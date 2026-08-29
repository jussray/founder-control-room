import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const commandWorkflow = readFileSync(
  new URL('../../../.github/workflows/trusted-review-witness-command.yml', import.meta.url),
  'utf8',
);
const witnessWorkflow = readFileSync(
  new URL('../../../.github/workflows/deterministic-review-core-advisory.yml', import.meta.url),
  'utf8',
);

describe('trusted review witness command contract', () => {
  it('accepts only the founder command on governance issue 418', () => {
    expect(commandWorkflow).toContain('issue_comment:');
    expect(commandWorkflow).toContain("github.event.issue.number == 418");
    expect(commandWorkflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(commandWorkflow).toContain("startsWith(github.event.comment.body, '/review-witness ')");
    expect(commandWorkflow).toContain(
      'Expected exactly: /review-witness <pull-request-number> <40-char-current-main-sha>',
    );
    expect(commandWorkflow).toContain("re.fullmatch(r'[1-9][0-9]{0,8}', pr_number)");
    expect(commandWorkflow).toContain("re.fullmatch(r'[0-9a-f]{40}', main_sha)");
  });

  it('fails closed unless the command names exact current main and an open PR targeting it', () => {
    expect(commandWorkflow).toContain('/git/ref/heads/main');
    expect(commandWorkflow).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
    expect(commandWorkflow).toContain('pulls/${PR_NUMBER}');
    expect(commandWorkflow).toContain("test \"$state\" = 'open'");
    expect(commandWorkflow).toContain("test \"$base_ref\" = 'main'");
    expect(commandWorkflow).toContain('test "$base_sha" = "$EXPECTED_MAIN_SHA"');
  });

  it('has only the permissions needed to request the trusted workflow', () => {
    expect(commandWorkflow).toContain('contents: read');
    expect(commandWorkflow).toContain('actions: write');
    expect(commandWorkflow).toContain('issues: read');
    expect(commandWorkflow).toContain('pull-requests: read');
    expect(commandWorkflow).not.toContain('contents: write');
    expect(commandWorkflow).not.toContain('issues: write');
    expect(commandWorkflow).not.toContain('pull-requests: write');
  });

  it('hard-codes the trusted witness workflow and cannot select deploy or provider mutation targets', () => {
    expect(commandWorkflow).toContain(
      '/actions/workflows/deterministic-review-core-advisory.yml/dispatches',
    );
    expect(commandWorkflow).toContain('--arg ref main');
    expect(commandWorkflow).toContain('--argjson pr "$PR_NUMBER"');
    expect(commandWorkflow).toContain("'{ref:$ref, inputs:{pull_request_number:$pr}}'");

    expect(commandWorkflow).not.toContain('/actions/workflows/deploy.yml/dispatches');
    expect(commandWorkflow).not.toContain('/actions/workflows/worker-reconcile.yml/dispatches');
    expect(commandWorkflow).not.toContain('supabase');
    expect(commandWorkflow).not.toContain('wrangler');
    expect(commandWorkflow).not.toContain('CLOUDFLARE_');
    expect(commandWorkflow).not.toContain('SUPABASE_');
    expect(commandWorkflow).not.toContain('GITHUB_PRIVATE_KEY');
    expect(commandWorkflow).not.toContain('secrets.');
  });

  it('leaves review publication and readback inside trusted current-main code', () => {
    expect(witnessWorkflow).toContain('workflow_dispatch:');
    expect(witnessWorkflow).toContain('pull_request_number:');
    expect(witnessWorkflow).toContain('required: true');
    expect(witnessWorkflow).toContain('type: number');
    expect(witnessWorkflow).toContain(
      "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'",
    );
    expect(witnessWorkflow).toContain('environment: production');
    expect(witnessWorkflow).toContain('EXPECTED_TRUSTED_MAIN_SHA: ${{ github.sha }}');
    expect(witnessWorkflow).toContain('GITHUB_APP_ID: ${{ secrets.GITHUB_APP_ID }}');
    expect(witnessWorkflow).toContain('GITHUB_PRIVATE_KEY: ${{ secrets.GITHUB_PRIVATE_KEY }}');
    expect(witnessWorkflow).toContain('test "$EXPECTED_TRUSTED_MAIN_SHA" = "$current_main"');
    expect(witnessWorkflow).toContain('node scripts/publish-deterministic-review-witness.mjs');
    expect(witnessWorkflow).toContain('Re-read trusted main after publication');
  });

  it('states that dispatch is evidence only, never merge or release authority', () => {
    expect(commandWorkflow).toContain(
      'Verdict, Founder Final, merge, deploy, provider, database, secret, and publication authority: none granted by this command',
    );
  });
});
