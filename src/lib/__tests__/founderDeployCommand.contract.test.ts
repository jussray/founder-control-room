import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/founder-deploy-command.yml', import.meta.url),
  'utf8',
);

describe('Founder deploy command authority contract', () => {
  it('accepts only the founder command on canonical issue 182', () => {
    expect(workflow).toContain('issue_comment:');
    expect(workflow).toContain("github.event.issue.number == 182");
    expect(workflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(workflow).toContain("startsWith(github.event.comment.body, '/deploy-fcr ')");
    expect(workflow).toContain('Expected exactly: /deploy-fcr <40-char-main-sha> <approval-reference>');
    expect(workflow).toContain("re.fullmatch(r'[0-9a-f]{40}', sha)");
  });

  it('requires the requested SHA to equal current main before dispatch', () => {
    expect(workflow).toContain('/git/ref/heads/main');
    expect(workflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
  });

  it('delegates mutation to the existing canonical deploy workflow only', () => {
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('/actions/workflows/deploy.yml/dispatches');
    expect(workflow).toContain('expected_head_sha: $sha');
    expect(workflow).toContain('deployment_approval_id: $approval');

    expect(workflow).not.toContain('wrangler deploy');
    expect(workflow).not.toContain('supabase db push');
    expect(workflow).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(workflow).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(workflow).not.toContain('secrets.');
  });
});
