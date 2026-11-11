import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { observeCloudflareWorker, parseDesiredWorkerConfig, summarizeProviderState } from '../scripts/observe-cloudflare-runtime-state.mjs';

const CONFIG = [
  'name = "founder-control-room"',
  '[secrets]',
  'required = [',
  '  "GITHUB_APP_ID",',
  '  "FOUNDER_SESSION_ENCRYPTION_KEY",',
  ']',
  '[triggers]',
  'crons = ["* * * * *"]',
].join('\n');

function settings(type = 'secret_text') {
  return { bindings: [
    { name: 'FOUNDER_SESSION_ENCRYPTION_KEY', type: 'secret_text', text: 'never persist this value' },
    { name: 'GITHUB_APP_ID', type },
  ] };
}
const schedules = { schedules: [{ cron: '* * * * *' }] };
const activeVersion = { resources: { script: { handlers: ['fetch', 'scheduled'] } } };
const versionId = 'f59e6821-3309-4e10-869e-7ae32e5ffee6';

test('parses pinned worker, required secrets and cron from Wrangler declaration', () => {
  const config = parseDesiredWorkerConfig(CONFIG);
  assert.deepEqual(config, { worker: 'founder-control-room', requiredSecrets: ['FOUNDER_SESSION_ENCRYPTION_KEY', 'GITHUB_APP_ID'], crons: ['* * * * *'] });
  assert.throws(() => parseDesiredWorkerConfig(CONFIG.replace('founder-control-room', 'other')), /DECLARATION_INVALID/u);
});

test('provider readback emits only sanitized structural proof with no values', () => {
  const desired = parseDesiredWorkerConfig(CONFIG);
  const receipt = summarizeProviderState(desired, settings(), schedules, new Date('2026-10-19T12:00:00Z'), activeVersion);
  assert.equal(receipt.status, 'aligned');
  assert.match(receipt.observedStateDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(receipt.canAuthorizeProviderMutation, false);
  assert.equal(receipt.exactDeploymentShaVerified, false);
  assert.equal(JSON.stringify(receipt).includes('never persist this value'), false);
});

test('missing cron or required secret yields drift, not clean evidence', () => {
  const desired = parseDesiredWorkerConfig(CONFIG);
  const receipt = summarizeProviderState(desired, settings('plain_text'), { schedules: [] }, new Date(), activeVersion);
  assert.equal(receipt.status, 'drift_detected');
  assert.deepEqual(receipt.mismatchKinds, ['missing_required_secret_bindings', 'missing_reconciliation_cron']);
  assert.deepEqual(receipt.missingRequiredSecretNames, ['GITHUB_APP_ID']);
});

test('plaintext API token is a blocking security finding', () => {
  const desired = parseDesiredWorkerConfig(CONFIG);
  const receipt = summarizeProviderState(desired, { bindings: [
    ...settings().bindings, { name: 'CF_API_TOKEN', type: 'plain_text', text: 'hidden' },
  ] }, schedules, new Date(), activeVersion);
  assert.equal(receipt.status, 'drift_detected');
  assert.ok(receipt.mismatchKinds.includes('plaintext_api_token_binding'));
  assert.equal(JSON.stringify(receipt).includes('hidden'), false);
});

test('malformed or partial provider response cannot be promoted to proof', () => {
  const desired = parseDesiredWorkerConfig(CONFIG);
  assert.throws(() => summarizeProviderState(desired, {}, schedules, new Date(), activeVersion), /PROVIDER_RESPONSE_INVALID/u);
  assert.throws(() => summarizeProviderState(desired, settings(), {}, new Date(), activeVersion), /PROVIDER_RESPONSE_INVALID/u);
  assert.throws(() => summarizeProviderState(desired, { bindings: [{ name: 'CF_API_TOKEN', type: 'plain_text', text: 'secret' }, { name: 'CF_API_TOKEN', type: 'secret_text' }] }, schedules, new Date(), activeVersion), /PROVIDER_BINDING_DUPLICATE/u);
});

test('a fetch-only deployed Worker fails despite present cron and secrets', () => {
  const desired = parseDesiredWorkerConfig(CONFIG);
  const receipt = summarizeProviderState(desired, settings(), schedules, new Date(), { resources: { script: { handlers: ['fetch'] } } });
  assert.equal(receipt.status, 'drift_detected');
  assert.deepEqual(receipt.mismatchKinds, ['missing_deployed_scheduled_handler']);
  assert.equal(receipt.deployedScheduledHandlerPresent, false);
  assert.throws(() => summarizeProviderState(desired, settings(), schedules, new Date()), /PROVIDER_RESPONSE_INVALID/u);
});

test('real API path is read-only and provider response must succeed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fcr-cloudflare-observer-'));
  fs.writeFileSync(path.join(root, 'wrangler.worker.toml'), CONFIG);
  const called = [];
  const fetcher = async (url, opts) => {
    called.push({ url, method: opts.method });
    const result = url.endsWith('/settings') ? settings()
      : url.endsWith('/schedules') ? schedules
      : url.endsWith('/deployments') ? { deployments: [{ versions: [{ version_id: versionId, percentage: 100 }] }] }
      : url.endsWith('/versions/' + versionId) ? activeVersion : null;
    return { ok: true, json: async () => ({ success: true, result }) };
  };
  try {
    const receipt = await observeCloudflareWorker({ token: 'safe-test-token', root, fetcher });
    assert.equal(receipt.status, 'aligned');
    assert.equal(called.length, 4);
    assert.ok(called.every(({ method }) => method === 'GET'));
    assert.ok(called.every(({ url }) => url.includes('/accounts/9b59861bd1747cf7525571b4c51d2aa0/workers/scripts/founder-control-room/')));
    await assert.rejects(() => observeCloudflareWorker({ token: 'Bearer invalid', root, fetcher }), /TOKEN_UNAVAILABLE_OR_UNSAFE/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
