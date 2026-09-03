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

  it('fails closed on malformed Cloudflare credentials before secret-name readback', () => {
    const authorityStart = workflow.indexOf('  authority-gate:');
    const supabaseStart = workflow.indexOf('  # ── 1.', authorityStart);
    const authorityGate = workflow.slice(authorityStart, supabaseStart);

    const credentialCheckIndex = authorityGate.indexOf('token.encode(\'ascii\')');
    const providerReadbackIndex = authorityGate.indexOf(
      'npx --yes wrangler@4.110.0 secret list',
    );

    expect(credentialCheckIndex).toBeGreaterThanOrEqual(0);
    expect(providerReadbackIndex).toBeGreaterThan(credentialCheckIndex);
    expect(authorityGate).toContain('contains non-ASCII characters');
    expect(authorityGate).toContain('contains whitespace or non-printable characters');
    expect(authorityGate).toContain("re.fullmatch(r'[0-9a-f]{32}', account_id)");
  });

  it('derives the provider-held set from the canonical Worker contract', () => {
    expect(wrangler).toMatch(/^\[secrets\]\nrequired = \[/m);
    expect(wrangler).toContain('"FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON",');
    expect(wrangler).toContain('"SUPABASE_SERVICE_ROLE_KEY",');
    expect(wrangler).toContain('"FOUNDER_SESSION_ENCRYPTION_KEY",');
  });
});
