import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const commandWorkflow = readFileSync(
  new URL('../../../.github/workflows/founder-deploy-command.yml', import.meta.url),
  'utf8',
);
const deployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const reconcileWorkflow = readFileSync(
  new URL('../../../.github/workflows/worker-reconcile.yml', import.meta.url),
  'utf8',
);
const reviewEmailReconcileWorkflow = readFileSync(
  new URL('../../../.github/workflows/review-email-worker-reconcile.yml', import.meta.url),
  'utf8',
);
const workerConfig = readFileSync(
  new URL('../../../wrangler.worker.toml', import.meta.url),
  'utf8',
);

function configuredWorkerSecretNames() {
  const secretBlock = workerConfig.match(/\[secrets\]\s+required\s*=\s*\[([\s\S]*?)\]/);
  expect(secretBlock).not.toBeNull();
  return Array.from(secretBlock![1].matchAll(/"([A-Z0-9_]+)"/g), ([, name]) => name);
}

function commandJobBlock(name: string, nextName: string) {
  const pattern = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  ${nextName}:\\n)`);
  const block = commandWorkflow.match(pattern);
  expect(block).not.toBeNull();
  return block![1];
}

describe('Founder deploy command authority contract', () => {
  it('accepts only the founder Worker command on canonical issue 182', () => {
    expect(commandWorkflow).toContain('issue_comment:');
    expect(commandWorkflow).toContain("github.event.issue.number == 182");
    expect(commandWorkflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(commandWorkflow).toContain("startsWith(github.event.comment.body, '/deploy-fcr ')");
    expect(commandWorkflow).toContain('Expected exactly: /deploy-fcr <40-char-main-sha> <approval-reference>');
    expect(commandWorkflow).toContain("re.fullmatch(r'[0-9a-f]{40}', sha)");
  });

  it('requires requested SHAs to equal current main before any dispatch', () => {
    expect(commandWorkflow).toContain('/git/ref/heads/main');
    expect(commandWorkflow.match(/test \"\$CURRENT_MAIN_SHA\" = \"\$EXPECTED_HEAD_SHA\"/g)).toHaveLength(3);
  });

  it('keeps the canonical /deploy-fcr command Worker-only', () => {
    const workerDispatch = commandJobBlock('dispatch', 'dispatch-production');

    expect(commandWorkflow).toContain('actions: write');
    expect(workerDispatch).toContain('/actions/workflows/worker-reconcile.yml/dispatches');
    expect(workerDispatch).toContain('expected_head_sha: $sha');
    expect(workerDispatch).toContain('deployment_approval_id: $approval');
    expect(workerDispatch).not.toContain('/actions/workflows/deploy.yml/dispatches');

    expect(workerDispatch).not.toContain('wrangler deploy');
    expect(workerDispatch).not.toContain('supabase db push');
    expect(workerDispatch).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(workerDispatch).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(workerDispatch).not.toContain('secrets.');
  });

  it('accepts a distinct founder production command only on Supabase incident 247', () => {
    const productionDispatch = commandJobBlock('dispatch-production', 'dispatch-review-email');

    expect(productionDispatch).toContain("github.event.issue.number == 247");
    expect(productionDispatch).toContain("github.event.comment.user.login == 'jussray'");
    expect(productionDispatch).toContain("startsWith(github.event.comment.body, '/deploy-fcr-production ')");
    expect(productionDispatch).toContain(
      'Expected exactly: /deploy-fcr-production <40-char-main-sha> <approval-reference>',
    );
    expect(productionDispatch).toContain('/actions/workflows/deploy.yml/dispatches');
    expect(productionDispatch).toContain('expected_head_sha: $sha');
    expect(productionDispatch).toContain('deployment_approval_id: $approval');
    expect(productionDispatch).not.toContain('/actions/workflows/worker-reconcile.yml/dispatches');
  });

  it('keeps the production bridge provider-blind and delegates mutation to canonical Deploy', () => {
    const productionDispatch = commandJobBlock('dispatch-production', 'dispatch-review-email');

    expect(productionDispatch).not.toContain('wrangler deploy');
    expect(productionDispatch).not.toContain('supabase db push');
    expect(productionDispatch).not.toContain('SUPABASE_DB_URL');
    expect(productionDispatch).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(productionDispatch).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(productionDispatch).not.toContain('secrets.');

    expect(deployWorkflow).toContain('workflow_dispatch:');
    expect(deployWorkflow).toContain('expected_head_sha:');
    expect(deployWorkflow).toContain('deployment_approval_id:');
    expect(deployWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(deployWorkflow).toContain('supabase db push');
    expect(deployWorkflow).toContain('--dry-run');
    expect(deployWorkflow).toContain('--include-all');
    expect(deployWorkflow).toContain('Verify post-push migration ledger');
  });

  it('accepts a separate founder-only review-email command only on issue 395', () => {
    expect(commandWorkflow).toContain("github.event.issue.number == 395");
    expect(commandWorkflow).toContain("github.event.comment.user.login == 'jussray'");
    expect(commandWorkflow).toContain("startsWith(github.event.comment.body, '/deploy-fcr-review-email ')");
    expect(commandWorkflow).toContain(
      'Expected exactly: /deploy-fcr-review-email <40-char-main-sha> <approval-reference>',
    );
    expect(commandWorkflow).toContain('/actions/workflows/review-email-worker-reconcile.yml/dispatches');
    expect(commandWorkflow).toContain(
      'Deploy privately bound founder-control-room-review-email Worker for issue #395',
    );
  });

  it('keeps every issue-comment dispatch bridge provider-blind', () => {
    expect(commandWorkflow).not.toContain('wrangler deploy');
    expect(commandWorkflow).not.toContain('supabase db push');
    expect(commandWorkflow).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(commandWorkflow).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(commandWorkflow).not.toContain('secrets.');

    expect(reviewEmailReconcileWorkflow).toContain('workflow_dispatch:');
    expect(reviewEmailReconcileWorkflow).toContain('environment: production');
    expect(reviewEmailReconcileWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(reviewEmailReconcileWorkflow).toContain('wrangler deploy --config wrangler.email.toml');
    expect(reviewEmailReconcileWorkflow).toContain("'FOUNDER_CONTROL_ROOM_API (founder-control-room)'");
    expect(reviewEmailReconcileWorkflow).not.toContain('wrangler deploy --config wrangler.worker.toml');
    expect(reviewEmailReconcileWorkflow).not.toContain('wrangler deploy --config wrangler.deletion-queue.toml');
    expect(reviewEmailReconcileWorkflow).not.toContain('supabase db push');
    expect(reviewEmailReconcileWorkflow).not.toContain('/access/apps');
    expect(reviewEmailReconcileWorkflow).toContain('runtime_email_invocation_proven: false');
  });

  it('keeps the reconciliation target exact-head, Worker-only, and non-publishing', () => {
    expect(reconcileWorkflow).toContain('workflow_dispatch:');
    expect(reconcileWorkflow).toContain('environment: production');
    expect(reconcileWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(reconcileWorkflow).toContain('command: deploy --config wrangler.worker.toml --var GIT_SHA:${{ inputs.expected_head_sha }}');
    expect(reconcileWorkflow).toContain('https://api.foundercontrolroom.org');
    expect(reconcileWorkflow).toContain('x-founder-control-room-service');
    expect(reconcileWorkflow).toContain('.service == "founder-control-room" and .gitSha == $expected');
    expect(reconcileWorkflow).toContain('.founderSignalAutomationGrant.configured == true and .founderSignalAutomationGrant.enabled == false');

    expect(reconcileWorkflow).not.toContain('supabase db push');
    expect(reconcileWorkflow).not.toContain('SUPABASE_DB_URL');
    expect(reconcileWorkflow).not.toContain('proof-of-ship');
    expect(reconcileWorkflow).not.toContain('ZAPIER_CATCH_HOOK_URL');
    expect(reconcileWorkflow).not.toContain('PUBLISH_ALLOWED');
  });

  it('preserves required Worker bindings while forcing the publication grant disabled through the canonical config', () => {
    expect(reconcileWorkflow).toContain('Existing Worker runtime secrets: preserved except \\`FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON\\`, which this workflow forces disabled');
    expect(reconcileWorkflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(reconcileWorkflow).not.toContain('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(reconcileWorkflow).toContain('wrangler.worker.toml must declare a 32-character lowercase Cloudflare account_id');
    expect(workerConfig).toMatch(/^account_id = "[0-9a-f]{32}"$/m);
    expect(reconcileWorkflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
    expect(reconcileWorkflow).not.toContain('GITHUB_PRIVATE_KEY: ${{ secrets.GITHUB_PRIVATE_KEY }}');
    expect(reconcileWorkflow).not.toContain('FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: ${{ secrets.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN }}');
    expect(configuredWorkerSecretNames()).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'FOUNDER_SESSION_ENCRYPTION_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY',
      'FCR_REMOTE_MCP_READ_TOKEN',
      'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON',
      'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN',
      'ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL',
      'FOUNDER_REVIEW_EMAIL_INGRESS_SECRET',
    ]);
    expect(reconcileWorkflow).toContain('./node_modules/.bin/wrangler secret put FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON \\');
    expect(reconcileWorkflow).toContain('--config wrangler.worker.toml < "$grant_file"');
    expect(reconcileWorkflow).not.toMatch(/^\s+secrets:\s*\|/m);
    expect(reconcileWorkflow).toContain('"id":"founder-signal-draft-only-v2","enabled":false');
  });
});
