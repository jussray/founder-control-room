import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/portfolio-evidence-sync.yml', 'utf8');
const syncSource = readFileSync('scripts/sync-jussco-portfolio-evidence.mjs', 'utf8');
const mintSource = readFileSync('scripts/mint-portfolio-github-app-token.mjs', 'utf8');

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
    expect(workflow).toMatch(/^permissions:\n  contents: read$/m);
  });

  it('keeps the minted token file as the only workflow credential handoff', () => {
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('PORTFOLIO_SYNC_TOKEN="$token" node scripts/sync-jussco-portfolio-evidence.mjs');
    expect(workflow).toContain('rm -f "$PORTFOLIO_SYNC_TOKEN_FILE"');
  });
  it('proposes evidence instead of pushing to main', () => {
    expect(syncSource).not.toContain('publishAtomicRegistryCommit');
    expect(syncSource).toContain("state: changed ? 'PROPOSED_UNPUBLISHED' : 'NO_CHANGE'");
    expect(syncSource).toContain('publicationAuthorized: false');
    expect(workflow).toContain("if: ${{ steps.sync.outputs.state == 'PUBLISHED' }}");
    expect(workflow).toContain('artifacts/portfolio-evidence-sync/proposed/');
  });

  it('mints only read-only portfolio sync credentials', () => {
    expect(mintSource).toContain("'portfolio-sync': Object.freeze({ contents: 'read', pull_requests: 'read', checks: 'read' })");
    expect(mintSource).not.toContain("'portfolio-sync': Object.freeze({ contents: 'write'");
  });

  it('does not project private source identities and SHAs into public evidence', () => {
    expect(syncSource).toContain('NON_PUBLIC_REPOSITORY_EVIDENCE_REDACTED');
    expect(syncSource).toContain('visibility: observation.visibility');
  });
  it('preserves credential history by marking scope and validity unverified on a failed workflow', () => {
    expect(workflow).toContain('id: mint');
    expect(workflow).toContain('MINT_STEP_OUTCOME: ${{ steps.mint.outcome }}');
    expect(workflow).toContain('bindingOrigin:"UNKNOWN_FROM_WORKFLOW"');
    expect(workflow).toContain('providerCredentialValidity:"NOT_EVALUATED_BY_THIS_RECEIPT"');
    expect(workflow).toContain('mintStepOutcome:$mint');
    expect(workflow).not.toContain('credentialRevoked:true');
    expect(workflow).not.toContain('rotate_private_key');
  });

  it('keeps sensitive provider identity scoped to the production environment', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}');
    expect(workflow).not.toContain('APP_PRIVATE_KEY: ${{ vars.APP_PRIVATE_KEY }}');
  });

});
