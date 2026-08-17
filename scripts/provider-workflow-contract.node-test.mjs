import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return text.slice(startIndex, endIndex);
}

const accessRecovery = read('.github/workflows/fcr-access-front-door-recovery.yml');
const workerReconcile = read('.github/workflows/worker-reconcile.yml');
const buildDiagnostic = read('.github/workflows/cloudflare-build-diagnostic.yml');

test('Access inspection receives only the dedicated read credential', () => {
  const block = between(
    accessRecovery,
    '- name: Inspect provider state without mutation',
    '- name: Apply one-zone Access exemption with dedicated admin authority',
  );

  assert.match(block, /CLOUDFLARE_ACCESS_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_ACCESS_API_TOKEN \}\}/);
  assert.doesNotMatch(block, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.doesNotMatch(block, /secrets\.CLOUDFLARE_API_TOKEN/);
});

test('Access mutation receives only dedicated admin authority', () => {
  const block = between(
    accessRecovery,
    '- name: Apply one-zone Access exemption with dedicated admin authority',
    '- name: Install Chromium for post-apply proof',
  );

  assert.match(block, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN \}\}/);
  assert.doesNotMatch(block, /CLOUDFLARE_ACCESS_API_TOKEN:/);
  assert.doesNotMatch(block, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(block, /--apply/);
});

test('Access apply is exact-main and founder-approval gated', () => {
  assert.match(accessRecovery, /test "\$current_main" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(accessRecovery, /apply=true requires an auditable 8-200 character approval_reference/);
  assert.match(accessRecovery, /environment: production/);
  assert.match(accessRecovery, /group: fcr-access-front-door-recovery-production/);
});

test('Worker mutation is downstream of the shared credential preflight', () => {
  const preflight = workerReconcile.indexOf('Preflight canonical Worker token with shared contract');
  const secretMutation = workerReconcile.indexOf('Force publication grant disabled on canonical Worker');
  const deploy = workerReconcile.indexOf('Deploy only the canonical Worker configuration');

  assert.ok(preflight >= 0);
  assert.ok(secretMutation > preflight);
  assert.ok(deploy > secretMutation);
  assert.match(workerReconcile, /--purpose canonical-worker-deploy/);
});

test('Build inspection is downstream of dedicated shared credential preflight', () => {
  const preflight = buildDiagnostic.indexOf('Preflight dedicated Builds credential with shared contract');
  const inspect = buildDiagnostic.indexOf('Inspect exact Cloudflare build and custom-domain ownership');

  assert.ok(preflight >= 0);
  assert.ok(inspect > preflight);
  assert.match(buildDiagnostic, /FCR_CLOUDFLARE_BUILDS_USER_TOKEN/);
  assert.match(buildDiagnostic, /--purpose cloudflare-workers-builds-read/);
  assert.doesNotMatch(buildDiagnostic, /secrets\.CLOUDFLARE_API_TOKEN/);
});
