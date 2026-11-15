import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const wrangler = readFileSync(new URL('../../../wrangler.worker.toml', import.meta.url), 'utf8');

describe('production Worker secret preflight contract', () => {
  it('reads provider-held secret names before any production mutation can start', () => {
    const authorityStart = workflow.indexOf('  authority-gate:');
    const supabaseStart = workflow.indexOf('  # ── 1.', authorityStart);

    expect(authorityStart).toBeGreaterThanOrEqual(0);
    expect(supabaseStart).toBeGreaterThan(authorityStart);

    const authorityGate = workflow.slice(authorityStart, supabaseStart);
    const preflightIndex = authorityGate.indexOf(
      '- name: Verify provider-held Worker secret names before mutation',
    );
    const authorityReceiptIndex = authorityGate.indexOf('- name: Record authority receipt');

    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(authorityReceiptIndex).toBeGreaterThan(preflightIndex);
    expect(authorityGate).toContain('npx --yes wrangler@4.110.0 secret list');
    expect(authorityGate).toContain('--config wrangler.worker.toml');
    expect(authorityGate).toContain('--format json');
    expect(authorityGate).toContain('tomllib.load');
    expect(authorityGate).toContain("workflow_written = {'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON'}");
    expect(authorityGate).toContain('required - workflow_written');
    expect(authorityGate).toContain('entry.get(\'name\')');
    expect(authorityGate).not.toContain('wrangler secret get');
    expect(authorityGate).not.toContain('.get(\'value\')');
  });

  it('runs the shared fail-closed credential contract before secret-name readback', () => {
    const authorityStart = workflow.indexOf('  authority-gate:');
    const supabaseStart = workflow.indexOf('  # ── 1.', authorityStart);
    const authorityGate = workflow.slice(authorityStart, supabaseStart);

    const credentialCheckIndex = authorityGate.indexOf(
      'node scripts/provider-credential-contract.mjs',
    );
    const providerReadbackIndex = authorityGate.indexOf(
      'npx --yes wrangler@4.110.0 secret list',
    );

    expect(credentialCheckIndex).toBeGreaterThanOrEqual(0);
    expect(providerReadbackIndex).toBeGreaterThan(credentialCheckIndex);
    expect(authorityGate).toContain('--env CLOUDFLARE_API_TOKEN');
    expect(authorityGate).toContain('--account-id-env CLOUDFLARE_ACCOUNT_ID');
    expect(authorityGate).toContain('--require-account-id true');
    expect(authorityGate).toContain('--purpose fcr-production-deploy-authority');
    expect(authorityGate).not.toContain("token.encode('ascii')");
    expect(authorityGate).not.toContain("re.fullmatch(r'[0-9a-f]{32}', account_id)");
  });

  it('retains provider credential audit artifacts after preflight failure when files exist', () => {
    const authorityStart = workflow.indexOf('  authority-gate:');
    const deployStart = workflow.indexOf('  # ── 1.', authorityStart);
    const authorityGate = workflow.slice(authorityStart, deployStart);
    const preflight = authorityGate.indexOf('name: Verify provider-held Worker secret names before mutation');
    const upload = authorityGate.indexOf('name: Upload provider credential audit receipts');
    const uploadStep = authorityGate.slice(upload);

    expect(upload).toBeGreaterThan(preflight);
    expect(uploadStep).toContain('if: always()');
    expect(uploadStep).toContain('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    expect(uploadStep).toContain('${{ runner.temp }}/fcr-deploy-credential-shape.json');
    expect(uploadStep).toContain('${{ runner.temp }}/fcr-worker-secret-names.json');
    expect(uploadStep).toContain('retention-days: 90');
    expect(uploadStep).toContain('if-no-files-found: warn');
    expect(uploadStep).not.toContain('wrangler secret get');
  });

  it('derives the provider-held set from the canonical Worker contract', () => {
    expect(wrangler).toMatch(/^\[secrets\]\nrequired = \[/m);
    expect(wrangler).toContain('"FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON",');
    expect(wrangler).toContain('"SUPABASE_SERVICE_ROLE_KEY",');
    expect(wrangler).toContain('"FOUNDER_SESSION_ENCRYPTION_KEY",');
  });
});
