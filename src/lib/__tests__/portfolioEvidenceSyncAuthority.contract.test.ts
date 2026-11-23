import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/portfolio-evidence-sync.yml', 'utf8');

describe('portfolio evidence sync authority contract', () => {
  it('fails closed when GitHub App minting fails', () => {
    expect(workflow).toContain('APP_ID: ${{ secrets.APP_ID }}');
    expect(workflow).toContain('APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}');
    expect(workflow).toContain('node scripts/mint-portfolio-github-app-token.mjs');
    expect(workflow).toContain('PORTFOLIO_SYNC_TOKEN_FILE: ${{ runner.temp }}/portfolio-sync-token');
    expect(workflow).toContain('test -s "$PORTFOLIO_SYNC_TOKEN_FILE"');

    expect(workflow).not.toContain('${{ github.token }}');
    expect(workflow).not.toMatch(/\bGITHUB_TOKEN\b/);
    expect(workflow).not.toContain('Fallback to GITHUB_TOKEN');
  });

  it('keeps the minted token file as the only workflow credential handoff', () => {
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('PORTFOLIO_SYNC_TOKEN="$token" node scripts/sync-jussco-portfolio-evidence.mjs');
    expect(workflow).toContain('rm -f "$PORTFOLIO_SYNC_TOKEN_FILE"');
  });
});
