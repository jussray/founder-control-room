import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
  scripts?: Record<string, string>;
};
const guardPath = new URL('../../../scripts/assert-production-deploy-authority.mjs', import.meta.url);
const deployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);

function currentHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function runGuard(env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [guardPath.pathname], {
    cwd: new URL('../../../', import.meta.url),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      ...env,
    },
  });
}

describe('production deploy authority membrane', () => {
  it('guards the package deploy entry before Wrangler can run', () => {
    expect(packageJson.scripts?.deploy).toBe(
      'node scripts/assert-production-deploy-authority.mjs && wrangler deploy --config wrangler.worker.toml',
    );
  });

  it('makes provider rollback capture load-bearing before any production mutation', () => {
    const snapshotIndex = deployWorkflow.indexOf('\n  rollback-snapshot:');
    const migrationIndex = deployWorkflow.indexOf('\n  supabase-migrate:');
    const workerIndex = deployWorkflow.indexOf('\n  worker-deploy:');
    const pagesIndex = deployWorkflow.indexOf('\n  pages-release:');

    expect(snapshotIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeGreaterThan(snapshotIndex);
    expect(workerIndex).toBeGreaterThan(migrationIndex);
    expect(pagesIndex).toBeGreaterThan(workerIndex);

    expect(deployWorkflow).toMatch(
      /rollback-snapshot:[\s\S]*?needs: authority-gate[\s\S]*?node scripts\/capture-production-rollback-receipt\.mjs/,
    );
    expect(deployWorkflow).toMatch(
      /rollback-snapshot:[\s\S]*?production-rollback-receipt-\$\{\{ inputs\.expected_head_sha \}\}[\s\S]*?if-no-files-found: error/,
    );
    expect(deployWorkflow).toMatch(/supabase-migrate:[\s\S]*?needs: rollback-snapshot/);
  });

  it('blocks an ordinary or provider-native CI process', () => {
    const result = runGuard({ CI: 'true' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRODUCTION_DEPLOY_AUTHORITY_BLOCKED');
    expect(result.stderr).toContain('GitHub Actions');
  });

  it('blocks a GitHub push or pull-request context', () => {
    const result = runGuard({
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_WORKFLOW: 'Deploy',
      FOUNDER_PRODUCTION_DEPLOY_AUTHORITY: 'github-manual-exact-main-v1',
      EXPECTED_HEAD_SHA: currentHead(),
      DEPLOYMENT_APPROVAL_ID: 'test-approved-head',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('workflow_dispatch');
  });

  it('accepts only the explicit manual exact-head authority envelope', () => {
    const expectedHeadSha = currentHead();
    const result = runGuard({
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_WORKFLOW: 'Deploy',
      FOUNDER_PRODUCTION_DEPLOY_AUTHORITY: 'github-manual-exact-main-v1',
      EXPECTED_HEAD_SHA: expectedHeadSha,
      DEPLOYMENT_APPROVAL_ID: 'test-approved-head',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Production deploy authority membrane verified.');
    expect(result.stdout).toContain(expectedHeadSha);
  });

  it('rejects a mismatched approved SHA even with the manual workflow envelope', () => {
    const result = runGuard({
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_WORKFLOW: 'Deploy',
      FOUNDER_PRODUCTION_DEPLOY_AUTHORITY: 'github-manual-exact-main-v1',
      EXPECTED_HEAD_SHA: '0'.repeat(40),
      DEPLOYMENT_APPROVAL_ID: 'test-approved-head',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match approved SHA');
  });
});
