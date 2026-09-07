import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/review-email-worker-reconcile.yml', import.meta.url),
  'utf8',
);
const canonicalDeployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const canonicalReconcileWorkflow = readFileSync(
  new URL('../../../.github/workflows/worker-reconcile.yml', import.meta.url),
  'utf8',
);
const buildDiagnosticWorkflow = readFileSync(
  new URL('../../../.github/workflows/cloudflare-build-diagnostic.yml', import.meta.url),
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

  it('targets only the dedicated review-email Worker config, route, and canonical Service Binding', () => {
    expect(workflow).toContain('npx --yes wrangler@4.129.0 deploy --config wrangler.email.toml');
    expect(workflow).toContain("'FOUNDER_CONTROL_ROOM_API (founder-control-room)'");
    expect(workflow).not.toContain('wrangler deploy --config wrangler.worker.toml');
    expect(workflow).not.toContain('wrangler deploy --config wrangler.deletion-queue.toml');

    expect(emailConfig).toMatch(/^name = "founder-control-room-review-email"$/m);
    expect(emailConfig).toMatch(/^account_id = "[0-9a-f]{32}"$/m);
    expect(emailConfig).toMatch(/^addresses = \["review@foundercontrolroom.org"\]$/m);
    expect(emailConfig).not.toMatch(/addresses\s*=\s*\[[^\]]*\*@/m);
    expect(emailConfig).not.toContain('[[routes]]');
    expect(emailConfig).toMatch(/^binding = "FOUNDER_CONTROL_ROOM_API"$/m);
    expect(emailConfig).toMatch(/^service = "founder-control-room"$/m);
  });

  it('separates Cloudflare credential authority by operation class', () => {
    const canonicalSecret = '${{ secrets.CLOUDFLARE_API_TOKEN }}';
    const reviewEmailSecret = '${{ secrets.CLOUDFLARE_REVIEW_EMAIL_DEPLOY_TOKEN }}';
    const buildsSecret = '${{ secrets.FCR_CLOUDFLARE_BUILDS_USER_TOKEN }}';
    const legacyBuildsSecret = '${{ secrets.CLOUDFLARE_BUILDS_API_TOKEN }}';

    expect(canonicalDeployWorkflow).toContain(canonicalSecret);
    expect(canonicalReconcileWorkflow).toContain(canonicalSecret);
    expect(canonicalDeployWorkflow).not.toContain(reviewEmailSecret);
    expect(canonicalReconcileWorkflow).not.toContain(reviewEmailSecret);

    expect(workflow).toContain(reviewEmailSecret);
    expect(workflow).not.toContain(canonicalSecret);
    expect(workflow).not.toContain(buildsSecret);

    expect(buildDiagnosticWorkflow).toContain(buildsSecret);
    expect(buildDiagnosticWorkflow).not.toContain(legacyBuildsSecret);
    expect(buildDiagnosticWorkflow).not.toContain(reviewEmailSecret);
    expect(buildDiagnosticWorkflow).not.toContain(canonicalSecret);
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

  it('rejects malformed dedicated review-email Cloudflare token values without printing them', () => {
    expect(workflow).toContain('Validate dedicated review-email Cloudflare token header safety');
    expect(workflow).toContain("token = os.environ.get('CLOUDFLARE_REVIEW_EMAIL_DEPLOY_TOKEN', '')");
    expect(workflow).toContain("token.encode('ascii')");
    expect(workflow).toContain('contains non-ASCII characters and cannot be used as an HTTP Authorization value');
    expect(workflow).toContain('contains whitespace or non-printable characters');
    expect(workflow).toContain('The token value was not printed.');
    expect(workflow).not.toContain('echo "$CLOUDFLARE_REVIEW_EMAIL_DEPLOY_TOKEN"');
    expect(workflow).not.toContain("print(token)");
  });

  it('initializes a redacted receipt before provider credential and secret-name checks', () => {
    expect(workflow).toContain('Initialize redacted reconciliation receipt');
    expect(workflow).toContain('email_routing_address: $address');
    expect(workflow).toContain('credential_header_safe: false');
    expect(workflow).toContain('required_secret_names_verified: false');
    expect(workflow).toContain('provider_deploy_succeeded: false');
    expect(workflow).toContain('email_trigger_reconciled: false');
    expect(workflow).toContain('blocked_stage: "credential_header_safety"');
    expect(workflow).toContain('.credential_header_safe = true | .blocked_stage = "secret_names"');
    expect(workflow).toContain('.required_secret_names_verified = true | .blocked_stage = "provider_deploy"');
    expect(workflow).toContain('.provider_deploy_succeeded = true | .email_trigger_reconciled = true | .blocked_stage = null');
    expect(workflow).toContain('if-no-files-found: error');
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
    expect(workflow).toContain('provider_deploy_succeeded: false');
    expect(workflow).toContain('.provider_deploy_succeeded = true');
    expect(workflow).toContain('email_trigger_reconciled: false');
    expect(workflow).toContain('.email_trigger_reconciled = true');
    expect(workflow).toContain('required_secret_names_verified: false');
    expect(workflow).toContain('.required_secret_names_verified = true');
    expect(workflow).toContain('runtime_email_invocation_proven: false');
    expect(workflow).toContain('fcr-review-email-worker-reconcile-${{ github.run_id }}-${{ github.run_attempt }}');
  });
});
