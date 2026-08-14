import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const commandWorkflow = readFileSync(
  new URL('../../../.github/workflows/founder-deploy-command.yml', import.meta.url),
  'utf8',
);
const reconcileWorkflow = readFileSync(
  new URL('../../../.github/workflows/worker-reconcile.yml', import.meta.url),
  'utf8',
);

describe('Founder deploy command authority contract', () => {
  it('accepts only the founder command on canonical issue 182', () => {
    expect(commandWorkflow).toContain('issue_comment:');
    expect(commandWorkflow).toContain("github.event.issue.number == 182");
    expect(commandWorkflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(commandWorkflow).toContain("startsWith(github.event.comment.body, '/deploy-fcr ')");
    expect(commandWorkflow).toContain('Expected exactly: /deploy-fcr <40-char-main-sha> <approval-reference>');
    expect(commandWorkflow).toContain("re.fullmatch(r'[0-9a-f]{40}', sha)");
  });

  it('requires the requested SHA to equal current main before dispatch', () => {
    expect(commandWorkflow).toContain('/git/ref/heads/main');
    expect(commandWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
  });

  it('delegates only to the bounded Worker reconciliation workflow', () => {
    expect(commandWorkflow).toContain('actions: write');
    expect(commandWorkflow).toContain('/actions/workflows/worker-reconcile.yml/dispatches');
    expect(commandWorkflow).toContain('expected_head_sha: $sha');
    expect(commandWorkflow).toContain('deployment_approval_id: $approval');
    expect(commandWorkflow).not.toContain('/actions/workflows/deploy.yml/dispatches');

    expect(commandWorkflow).not.toContain('wrangler deploy');
    expect(commandWorkflow).not.toContain('supabase db push');
    expect(commandWorkflow).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(commandWorkflow).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(commandWorkflow).not.toContain('secrets.');
  });

  it('keeps the reconciliation target exact-head, Worker-only, and non-publishing', () => {
    expect(reconcileWorkflow).toContain('workflow_dispatch:');
    expect(reconcileWorkflow).toContain('environment: production');
    expect(reconcileWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(reconcileWorkflow).toContain('command: deploy --config wrangler.worker.toml --var GIT_SHA:${{ inputs.expected_head_sha }}');
    expect(reconcileWorkflow).toContain('https://api.foundercontrolroom.org');
    expect(reconcileWorkflow).toContain('x-founder-control-room-service');
    expect(reconcileWorkflow).toContain('.service == "founder-control-room" and .gitSha == $expected');

    expect(reconcileWorkflow).not.toContain('supabase db push');
    expect(reconcileWorkflow).not.toContain('SUPABASE_DB_URL');
    expect(reconcileWorkflow).not.toContain('proof-of-ship');
    expect(reconcileWorkflow).not.toContain('ZAPIER_CATCH_HOOK_URL');
    expect(reconcileWorkflow).not.toContain('PUBLISH_ALLOWED');
  });
});
