import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { checkDispatch, hasBinding } from './activate-fcr-worker-github-app-key.mjs';

const allowed = {
  actor: 'jussray',
  ref: 'refs/heads/main',
  confirmation: 'INSTALL_EXISTING_FCR_APP_KEY',
  sha: 'a'.repeat(40),
  expectedSha: 'a'.repeat(40),
};

test('only exact founder main dispatch with matching immutable SHA is authorized', () => {
  assert.doesNotThrow(() => checkDispatch(allowed));
  for (const bad of [
    { actor: 'someone-else' },
    { ref: 'refs/heads/another-branch' },
    { confirmation: '' },
    { confirmation: 'CONFIRM' },
    { sha: 'b'.repeat(40) },
    { expectedSha: 'short' },
  ]) {
    assert.throws(() => checkDispatch({ ...allowed, ...bad }), /REQUIRED|MISMATCH/);
  }
});

test('missing Worker secret is distinct from a present, protected binding', () => {
  const current = [{ name: 'GITHUB_APP_ID', type: 'secret_text' }];
  assert.equal(hasBinding(current, 'GITHUB_APP_ID'), true);
  assert.equal(hasBinding(current, 'GITHUB_PRIVATE_KEY'), false);
  assert.equal(hasBinding([...current, { name: 'GITHUB_PRIVATE_KEY', type: 'secret_text' }], 'GITHUB_PRIVATE_KEY'), true);
  assert.equal(hasBinding(null, 'GITHUB_PRIVATE_KEY'), false);
});

test('separate activation is founder-only, non-automatic, and keeps canonical deploy intact', () => {
  const wf = readFileSync('.github/workflows/activate-fcr-worker-github-app-key.yml', 'utf8');
  const script = readFileSync('scripts/activate-fcr-worker-github-app-key.mjs', 'utf8');
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /^  (?:push|pull_request|schedule):/m);
  assert.match(wf, /github\.actor == 'jussray'/);
  assert.match(wf, /github\.ref == 'refs\/heads\/main'/);
  assert.match(wf, /^\s+environment: production$/m);
  assert.match(wf, /APP_ID: \$\{\{ secrets\.APP_ID \}\}/);
  assert.match(wf, /APP_PRIVATE_KEY: \$\{\{ secrets\.APP_PRIVATE_KEY \}\}/);
  assert.match(wf, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(script, /assertAppInstallation\(appId, key\)/);
  assert.match(script, /WORKER_PRIVATE_KEY_ALREADY_BOUND_REFUSE_OVERWRITE/);
  assert.match(script, /secretValuePrinted: false/);
  assert.match(script, /liveReconciliationVerified: false/);
  assert.match(script, /await assertCurrentMain\(githubToken, expectedSha\)/);
  assert.match(script, /\/workers\/scripts\/' \+ WORKER/);
});
