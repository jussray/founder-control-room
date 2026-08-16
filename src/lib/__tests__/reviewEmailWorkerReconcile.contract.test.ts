import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/review-email-worker-reconcile.yml', import.meta.url),
  'utf8',
);
const emailConfig = readFileSync(
  new URL('../../../wrangler.email.toml', import.meta.url),
  'utf8',
);

describe('review-email Worker reconciliation authority contract', () => {
  it('is manual, exact-main, production-scoped, and non-bypassable by normal push', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^  push:/m);
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('expected_head_sha:');
    expect(workflow).toContain('deployment_approval_id:');
    expect(workflow).toContain('test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"');
    expect(workflow).toContain('ref: ${{ inputs.expected_head_sha }}');
    expect(workflow).toContain('needs: authority-gate');
  });

  it('targets only the dedicated review-email Worker config and canonical Service Binding', () => {
    expect(workflow).toContain('wrangler deploy --config wrangler.email.toml');
    expect(workflow).toContain("'FOUNDER_CONTROL_ROOM_API (founder-control-room)'");
    expect(workflow).not.toContain('wrangler deploy --config wrangler.worker.toml');
    expect(workflow).not.toContain('wrangler deploy --config wrangler.deletion-queue.toml');

    expect(emailConfig).toMatch(/^name = "founder-control-room-review-email"$/m);
    expect(emailConfig).toMatch(/^account_id = "[0-9a-f]{32}"$/m);
    expect(emailConfig).toMatch(/^binding = "FOUNDER_CONTROL_ROOM_API"$/m);
    expect(emailConfig).toMatch(/^service = "founder-control-room"$/m);
  });

  it('preserves existing secrets and verifies only their names before deploy', () => {
    expect(workflow).toContain('wrangler secret list');
    expect(workflow).toContain('--format json');
    expect(workflow).toContain('FOUNDER_REVIEW_FOUNDER_EMAIL');
    expect(workflow).toContain('FOUNDER_REVIEW_EMAIL_INGRESS_SECRET');
    expect(workflow).not.toContain('wrangler secret put');
    expect(workflow).not.toContain('wrangler secret delete');
    expect(workflow).not.toContain('wrangler secret bulk');
  });

  it('does not smuggle database, Access, publication, or broad Worker mutations into the lane', () => {
    expect(workflow).not.toContain('supabase db push');
    expect(workflow).not.toContain('SUPABASE_DB_URL');
    expect(workflow).not.toContain('/access/apps');
    expect(workflow).not.toContain('proof-of-ship');
    expect(workflow).not.toContain('PUBLISH_ALLOWED');
    expect(workflow).not.toContain('ZAPIER_CATCH_HOOK_URL');
    expect(workflow).toContain('supabase_db_mutation: false');
    expect(workflow).toContain('access_policy_mutation: false');
  });

  it('keeps provider deployment proof separate from unproven runtime email invocation', () => {
    expect(workflow).toContain('provider_deploy_succeeded: true');
    expect(workflow).toContain('required_secret_names_verified: true');
    expect(workflow).toContain('runtime_email_invocation_proven: false');
    expect(workflow).toContain('fcr-review-email-worker-reconcile-${{ github.run_id }}-${{ github.run_attempt }}');
  });
});
