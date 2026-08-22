import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const scriptUrl = new URL('../scripts/cloudflare-build-verification-only.mjs', import.meta.url);
const source = readFileSync(scriptUrl, 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const validEnv = {
  ...process.env,
  WORKERS_CI: '1',
  WORKERS_CI_BUILD_UUID: '11111111-1111-4111-8111-111111111111',
  WORKERS_CI_BRANCH: 'main',
  WORKERS_CI_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
};

test('Cloudflare verification-only lane cannot mutate Worker state', () => {
  assert.doesNotMatch(source, /wrangler|versions\s+(upload|deploy)|secret\s+put|fetch\s*\(/i);
  assert.match(source, /production_mutation:\s*false/);
  assert.match(source, /worker_version_upload:\s*false/);
  assert.match(source, /production_authority:\s*'github-actions:\.github\/workflows\/deploy\.yml'/);
});

test('Cloudflare dashboard build command resolves only to verification-only authority', () => {
  assert.equal(
    packageJson.scripts?.['deploy:api:production'],
    'npm run cloudflare:build:verify',
  );
  assert.equal(
    packageJson.scripts?.['cloudflare:build:verify'],
    'node scripts/cloudflare-build-verification-only.mjs',
  );
  assert.doesNotMatch(
    packageJson.scripts?.['cloudflare:build:verify'] ?? '',
    /wrangler|versions\s+(upload|deploy)|secret\s+put/i,
  );
});

test('Cloudflare verification-only lane emits an exact-SHA receipt', () => {
  const result = spawnSync(process.execPath, [scriptUrl], {
    env: validEnv,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.contract, 'founder-control-room/cloudflare-build-verification-only@v1');
  assert.equal(receipt.mode, 'verification-only');
  assert.equal(receipt.commit_sha, validEnv.WORKERS_CI_COMMIT_SHA);
  assert.equal(receipt.branch, 'main');
  assert.equal(receipt.production_mutation, false);
  assert.equal(receipt.runtime_secret_access_required, false);
});

test('Cloudflare verification-only lane fails outside Workers Builds', () => {
  const result = spawnSync(process.execPath, [scriptUrl], {
    env: { ...validEnv, WORKERS_CI: '0' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verification-only command may run only inside Cloudflare Workers Builds/);
});
