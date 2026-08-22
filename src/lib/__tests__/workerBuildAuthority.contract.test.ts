import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const scriptPath = fileURLToPath(
  new URL('../../../scripts/verify-worker-build-authority.mjs', import.meta.url),
);
const wranglerConfigPath = fileURLToPath(
  new URL('../../../wrangler.worker.toml', import.meta.url),
);
const packageJsonPath = fileURLToPath(new URL('../../../package.json', import.meta.url));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

const tempDirs: string[] = [];

async function runAuthority(env: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'fcr-build-authority-'));
  tempDirs.push(dir);
  const receiptPath = join(dir, 'receipt.json');
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKERS_CI: '',
      GITHUB_ACTIONS: '',
      GITHUB_WORKFLOW: '',
      GITHUB_EVENT_NAME: '',
      GITHUB_SHA: '',
      WORKERS_CI_COMMIT_SHA: '',
      WORKERS_CI_BRANCH: '',
      WORKERS_CI_BUILD_UUID: '',
      WRANGLER_COMMAND: '',
      FCR_BUILD_AUTHORITY_RECEIPT_PATH: receiptPath,
      ...env,
    },
  });
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Record<string, unknown>;
  return { result, receipt };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('Worker build authority membrane', () => {
  it('allows Cloudflare Workers Builds only as a non-promoting version upload of the exact checked-out source', async () => {
    const { result, receipt } = await runAuthority({
      WORKERS_CI: '1',
      WORKERS_CI_COMMIT_SHA: HEAD,
      WORKERS_CI_BRANCH: 'feature/test',
      WORKERS_CI_BUILD_UUID: 'build-uuid-123',
      WRANGLER_COMMAND: 'versions upload',
    });

    expect(result.status).toBe(0);
    expect(receipt).toMatchObject({
      ok: true,
      executionContext: 'cloudflare-workers-builds',
      sourceSha: HEAD,
      checkedOutSha: HEAD,
      sourceBranch: 'feature/test',
      buildUuid: 'build-uuid-123',
      authorityDecision: 'allow',
      productionPromotionAuthorized: false,
      nativeWorkerGitPromotionAllowed: false,
    });
  });

  it('blocks Workers Builds when provider commit identity differs from checked-out source', async () => {
    const { result, receipt } = await runAuthority({
      WORKERS_CI: '1',
      WORKERS_CI_COMMIT_SHA: 'a'.repeat(40),
      WORKERS_CI_BRANCH: 'feature/test',
      WORKERS_CI_BUILD_UUID: 'build-uuid-substitution',
      WRANGLER_COMMAND: 'versions upload',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match checked-out source');
    expect(receipt).toMatchObject({
      ok: false,
      executionContext: 'cloudflare-workers-builds',
      authorityDecision: 'block',
      productionPromotionAuthorized: false,
    });
  });

  it('blocks a native Workers Builds production deploy before Wrangler can promote it', async () => {
    const { result, receipt } = await runAuthority({
      WORKERS_CI: '1',
      WORKERS_CI_COMMIT_SHA: HEAD,
      WORKERS_CI_BRANCH: 'main',
      WORKERS_CI_BUILD_UUID: 'build-uuid-456',
      WRANGLER_COMMAND: 'deploy',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NATIVE_WORKER_GIT_PROMOTION_BLOCKED');
    expect(receipt).toMatchObject({
      ok: false,
      executionContext: 'cloudflare-workers-builds',
      authorityDecision: 'block',
      productionPromotionAuthorized: false,
      nativeWorkerGitPromotionAllowed: false,
    });
  });

  it('recognizes only the guarded manual GitHub workflows on the exact event SHA as production promotion contexts', async () => {
    const { result, receipt } = await runAuthority({
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_WORKFLOW: 'FCR Worker Reconcile',
      GITHUB_SHA: HEAD,
      WRANGLER_COMMAND: 'deploy',
    });

    expect(result.status).toBe(0);
    expect(receipt).toMatchObject({
      ok: true,
      executionContext: 'github-manual-production',
      sourceSha: HEAD,
      checkedOutSha: HEAD,
      githubEventSha: HEAD,
      authorityDecision: 'allow',
      productionPromotionAuthorized: true,
      nativeWorkerGitPromotionAllowed: false,
    });
  });

  it('blocks a guarded workflow when its event SHA does not match the checked-out production source', async () => {
    const { result, receipt } = await runAuthority({
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_WORKFLOW: 'Deploy',
      GITHUB_SHA: 'c'.repeat(40),
      WRANGLER_COMMAND: 'deploy',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not match GitHub workflow SHA');
    expect(receipt).toMatchObject({
      ok: false,
      executionContext: 'github-manual-production',
      authorityDecision: 'block',
      productionPromotionAuthorized: false,
      nativeWorkerGitPromotionAllowed: false,
    });
  });

  it('keeps ordinary GitHub CI in verification-only mode', async () => {
    const { result, receipt } = await runAuthority({
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_WORKFLOW: 'CI',
      GITHUB_SHA: 'd'.repeat(40),
      WRANGLER_COMMAND: 'deploy',
    });

    expect(result.status).toBe(0);
    expect(receipt).toMatchObject({
      ok: true,
      executionContext: 'github-verification-only',
      productionPromotionAuthorized: false,
      nativeWorkerGitPromotionAllowed: false,
    });
  });

  it('executes the exact Cloudflare dashboard build command as verification-only authority', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['deploy:api:production']).toBe('npm run cloudflare:build:verify');
    expect(packageJson.scripts?.['cloudflare:build:verify']).toBe(
      'node scripts/cloudflare-build-verification-only.mjs',
    );
    expect(packageJson.scripts?.['cloudflare:build:verify']).not.toMatch(
      /wrangler|versions\s+(upload|deploy)|secret\s+put/i,
    );

    const result = spawnSync(npmCommand, ['run', 'deploy:api:production'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKERS_CI: '1',
        WORKERS_CI_COMMIT_SHA: HEAD,
        WORKERS_CI_BRANCH: 'feature/test',
        WORKERS_CI_BUILD_UUID: 'build-command-contract',
      },
    });

    expect(result.status).toBe(0);
    const receiptLine = result.stdout
      .trim()
      .split('\n')
      .reverse()
      .find((line) => line.trim().startsWith('{'));
    expect(receiptLine).toBeTruthy();
    const receipt = JSON.parse(receiptLine ?? '{}') as Record<string, unknown>;
    expect(receipt).toMatchObject({
      contract: 'founder-control-room/cloudflare-build-verification-only@v1',
      provider: 'cloudflare-workers-builds',
      mode: 'verification-only',
      commit_sha: HEAD,
      production_mutation: false,
      worker_version_upload: false,
      runtime_secret_access_required: false,
      production_authority: 'github-actions:.github/workflows/deploy.yml',
    });
  });

  it('wires the membrane into the canonical Worker custom build hook', async () => {
    const config = await readFile(wranglerConfigPath, 'utf8');
    expect(config).toContain('[build]');
    expect(config).toContain('command = "node scripts/verify-worker-build-authority.mjs"');
  });
});
