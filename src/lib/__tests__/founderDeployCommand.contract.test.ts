import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reconcileWorkflow = readFileSync('.github/workflows/fcr-worker-reconcile.yml', 'utf8');
const workerConfig = readFileSync('wrangler.worker.toml', 'utf8');

function configuredWorkerSecretNames(): string[] {
  const secretBlock = workerConfig.match(/\[secrets\]\s*\nrequired\s*=\s*\[([\s\S]*?)\n\]/m)?.[1] ?? '';
  return Array.from(secretBlock.matchAll(/"([A-Z0-9_]+)"/g), (match) => match[1]);
}

describe('founder deploy command contract', () => {
  it('keeps canonical FCR deployment on the production Worker and exact-main authority path', () => {
    expect(reconcileWorkflow).toContain('name: Founder Control Room Worker Reconcile');
    expect(reconcileWorkflow).toContain('workflow_dispatch:');
    expect(reconcileWorkflow).toContain('environment: production');
    expect(reconcileWorkflow).toContain("EXPECTED_HEAD_SHA: ${{ inputs.expected_head_sha }}");
    expect(reconcileWorkflow).toContain('git ls-remote https://github.com/jussray/founder-control-room.git refs/heads/main');
    expect(reconcileWorkflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(reconcileWorkflow).toContain('wrangler deploy --config wrangler.worker.toml');
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

  it('preserves every declared Worker secret name while forcing the publication grant disabled through the canonical config', () => {
    expect(reconcileWorkflow).toContain('Existing Worker runtime secrets: preserved except \\`FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON\\`, which this workflow forces disabled');
    expect(reconcileWorkflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(reconcileWorkflow).not.toContain('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
    expect(reconcileWorkflow).toContain('wrangler.worker.toml must declare a 32-character lowercase Cloudflare account_id');
    expect(workerConfig).toMatch(/^account_id = "[0-9a-f]{32}"$/m);
    expect(reconcileWorkflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
    expect(reconcileWorkflow).not.toContain('GITHUB_PRIVATE_KEY: ${{ secrets.GITHUB_PRIVATE_KEY }}');
    expect(reconcileWorkflow).not.toContain('FCR_SHOPIFY_WEBHOOK_SECRET: ${{ secrets.FCR_SHOPIFY_WEBHOOK_SECRET }}');
    expect(reconcileWorkflow).not.toContain('FCR_COMMERCE_HASH_SALT: ${{ secrets.FCR_COMMERCE_HASH_SALT }}');
    expect(reconcileWorkflow).not.toContain('TINYFISH_API_KEY: ${{ secrets.TINYFISH_API_KEY }}');
    expect(reconcileWorkflow).not.toContain('FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: ${{ secrets.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN }}');
    expect(configuredWorkerSecretNames()).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'FOUNDER_SESSION_ENCRYPTION_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY',
      'FCR_REMOTE_MCP_READ_TOKEN',
      'FCR_SHOPIFY_WEBHOOK_SECRET',
      'FCR_COMMERCE_HASH_SALT',
      'TINYFISH_API_KEY',
      'FCR_CLOUDFLARE_MCP_READ_TOKEN',
      'MODEL_API_KEY',
      'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON',
      'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN',
      'ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL',
      'FOUNDER_REVIEW_EMAIL_INGRESS_SECRET',
      'N8N_FOUNDER_CONTENT_WEBHOOK_URL',
      'N8N_FOUNDER_CONTENT_BEARER_TOKEN',
      'N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_FINGERPRINT',
      'N8N_FOUNDER_CONTENT_IDENTITY_HMAC_SECRET',
    ]);
    expect(reconcileWorkflow).toContain('./node_modules/.bin/wrangler secret put FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON \\');
    expect(reconcileWorkflow).toContain('--config wrangler.worker.toml < "$grant_file"');
    expect(reconcileWorkflow).not.toMatch(/^\s+secrets:\s*\|/m);
    expect(reconcileWorkflow).toContain('"id":"founder-signal-draft-only-v2","enabled":false');
  });
});