import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeBrowserRequest, previewBrowserRequest } from '../scripts/fcr-browser-plan.mjs';

const manifest = readFileSync(new URL('../config/browser-journeys/sync-party.json', import.meta.url), 'utf8');
const load = async () => manifest;

test('plain-language Sync Party test is previewed, not executed', async () => {
  const preview = await previewBrowserRequest(
    'Test the complete new user journey on https://sync.jussco.company: create, join, choose, sync, score',
    load
  );
  assert.equal(preview.contract, 'fcr/browser-plan-preview@v1');
  assert.equal(preview.status, 'REQUIRES_FOUNDER_RUN_APPROVAL');
  assert.equal(preview.project, 'sync-party-game');
  assert.equal(preview.target, 'https://sync.jussco.company');
  assert.equal(preview.actors, 2);
  assert.equal(preview.steps, 53);
  assert.match(preview.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(preview.browserExecuted, false);
  assert.equal(preview.providerMutationAuthorized, false);
  assert.equal(preview.deployAuthorized, false);
  assert.equal(preview.mergeAuthorized, false);
});

test('project aliases select only one source-reviewed manifest', () => {
  const requests = [
    'Verify the Sync Party game journey',
    'Check my sync-party-game flow',
    'Run test of sync.jussco.company live journey',
    'Please audit Sync Party flow'
  ];
  for (const request of requests) {
    const routed = routeBrowserRequest(request);
    assert.equal(routed.status, 'ROUTED_FOR_PREVIEW', request);
    assert.equal(routed.manifest, 'config/browser-journeys/sync-party.json');
  }
});

test('unsafe or compound requests fail closed even when project is identified', async () => {
  for (const request of [
    'Test sync.jussco.company and then deploy fixes',
    'Check Sync Party and delete all test records',
    'Test Sync Party then merge any green PR',
    'Test sync.jussco.company and email results',
    'Test the Sync Party admin login',
    'Test Sync Party bypass auth requirements',
    'Test Sync Party and pay for a purchase',
    'Test sync.jussco.company and https://chief.foundercontrolroom.org',
    'Test sync.jussco.company then execute javascript',
    'Test sync.jussco.company then fetch request headers',
    'Use Sync Party to test unrelated pages',
    'Test unknown-website.example',
    'Hi',
    null,
    'Test Sync Party ' + 'x'.repeat(510)
  ]) {
    const route = routeBrowserRequest(request);
    assert.equal(route.status, 'REJECTED', String(request));
    const preview = await previewBrowserRequest(request, async () => {
      throw new Error('A rejected request must not load the manifest');
    });
    assert.equal(preview.status, 'REJECTED');
    assert.equal(preview.browserExecuted, false);
  }
});

test('a substituted or incorrectly scoped manifest cannot be previewed', async () => {
  const other = JSON.parse(manifest);
  other.target = 'https://chief.foundercontrolroom.org/';
  await assert.rejects(
    previewBrowserRequest('Test Sync Party flow', async () => JSON.stringify(other))
  );
  other.target = 'https://sync.jussco.company/';
  other.project = 'storyengine';
  await assert.rejects(
    previewBrowserRequest('Test Sync Party flow', async () => JSON.stringify(other))
  );
});

test('manifest content digest binds the exact preview configuration', async () => {
  const request = 'Test the Sync Party user journey';
  const a = await previewBrowserRequest(request, load);
  const altered = manifest.replace('"FCRBotHost"', '"FCRSyntheticHost"');
  const b = await previewBrowserRequest(request, async () => altered);
  assert.notEqual(a.manifestSha256, b.manifestSha256);
  assert.equal(a.browserExecuted, false);
  assert.equal(b.browserExecuted, false);
});


test('complete URL and bare hostname boundaries reject mixed projects before loading', async () => {
  for (const target of ['https://example.io', 'https://127.0.0.1', 'https://[::1]',
    'https://sync.jussco.company.evil.dev', 'https://games.jussco.company/', 'example.dev', '127.0.0.1',
    'http://sync.jussco.company', 'https://sync.jussco.company:8443',
    '//example.io', 'ftp://sync.jussco.company']) {
    const result = await previewBrowserRequest('Test Sync Party and ' + target, async () => {
      assert.fail('Rejected cross-project requests must not load a manifest');
    });
    assert.equal(result.status, 'REJECTED', target);
    assert.equal(result.reason, 'CROSS_PROJECT_REQUEST', target);
    assert.equal(result.browserExecuted, false);
  }
  for (const target of ['https://sync.jussco.company/', 'https://SYNC.JUSSCO.COMPANY',
    'https://sync.jussco.company:443', '(https://sync.jussco.company).',
    'https://sync.jussco.company/index.html']) {
    assert.equal(routeBrowserRequest('Test Sync Party at ' + target).status, 'ROUTED_FOR_PREVIEW', target);
  }
});

test('Games Hub launcher does not satisfy a SYNC Party game journey', () => {
  assert.equal(routeBrowserRequest('Test games.jussco.company live journey').status, 'REJECTED');
});
