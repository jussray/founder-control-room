import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const commandWorkflow = readFileSync(
  new URL('../../../.github/workflows/exact-head-recovery-command.yml', import.meta.url),
  'utf8',
);
const witnessWorkflow = readFileSync(
  new URL('../../../.github/workflows/deterministic-review-core-advisory.yml', import.meta.url),
  'utf8',
);

function reviewDispatchBlock() {
  const match = commandWorkflow.match(/\n  dispatch-review-witness:\n([\s\S]*)$/);
  expect(match).not.toBeNull();
  return match![1];
}

describe('Trusted review witness command authority contract', () => {
  it('accepts only the founder command on governance issue 418', () => {
    const reviewDispatch = reviewDispatchBlock();

    expect(commandWorkflow).toContain('issue_comment:');
    expect(reviewDispatch).toContain("github.event.issue.number == 418");
    expect(reviewDispatch).toContain("github.event.comment.user.login == 'jussray'");
    expect(reviewDispatch).toContain("startsWith(github.event.comment.body, '/review-witness ')");
    expect(reviewDispatch).toContain(
      'Expected exactly: /review-witness <pull-request-number> <40-char-current-main-sha>',
    );
    expect(reviewDispatch).toContain("re.fullmatch(r'[1-9][0-9]{0,8}', pr_number)");
    expect(reviewDispatch).toContain("re.fullmatch(r'[0-9a-f]{40}', main_sha)");
  });

  it('binds the request to exact current main and an open PR targeting main before dispatch', () => {
    const reviewDispatch = reviewDispatchBlock();

    expect(reviewDispatch).toContain('/git/ref/heads/main');
    expect(reviewDispatch).toContain('test "$current_main" = "$EXPECTED_MAIN_SHA"');
    expect(reviewDispatch).toContain('pulls/${PR_NUMBER}');
    expect(reviewDispatch).toContain("test \"$state\" = 'open'");
    expect(reviewDispatch).toContain("test \"$base_ref\" = 'main'");
    expect(reviewDispatch).toContain('test "$base_sha" = "$EXPECTED_MAIN_SHA"');
  });

  it('dispatches only the trusted deterministic witness workflow on main', () => {
    const reviewDispatch = reviewDispatchBlock();

    expect(commandWorkflow).toContain('actions: write');
    expect(commandWorkflow).toContain('pull-requests: read');
    expect(commandWorkflow).not.toContain('contents: write');
    expect(commandWorkflow).not.toContain('pull-requests: write');

    expect(reviewDispatch).toContain(
      '/actions/workflows/deterministic-review-core-advisory.yml/dispatches',
    );
    expect(reviewDispatch).toContain('--arg ref main');
    expect(reviewDispatch).toContain('--argjson pr "$PR_NUMBER"');
    expect(reviewDispatch).toContain("'{ref:$ref, inputs:{pull_request_number:$pr}}'");

    expect(reviewDispatch).not.toContain('/actions/workflows/deploy.yml/dispatches');
    expect(reviewDispatch).not.toContain('/actions/workflows/worker-reconcile.yml/dispatches');
    expect(reviewDispatch).not.toContain('/merges');
  });

  it('keeps the issue-comment bridge provider-blind and secret-blind', () => {
    const reviewDispatch = reviewDispatchBlock();

    expect(reviewDispatch).not.toContain('wrangler');
    expect(reviewDispatch).not.toContain('supabase');
    expect(reviewDispatch).not.toContain('CLOUDFLARE_');
    expect(reviewDispatch).not.toContain('SUPABASE_');
    expect(reviewDispatch).not.toContain('GITHUB_PRIVATE_KEY');
    expect(reviewDispatch).not.toContain('secrets.');
    expect(reviewDispatch).toContain(
      'Review verdict, Founder Final, merge, deploy, provider, database, secret, and publication authority: none granted by this dispatch',
    );
  });

  it('leaves trusted publication inside the current-main witness workflow', () => {
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
    expect(witnessWorkflow).toContain('deterministic-review-witness-pr-${{ inputs.pull_request_number }}-');
  });
});
