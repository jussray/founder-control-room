import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBindingTypes, runProviderPreflight } from '../scripts/verify-worker-binding-types.mjs';

const response = bindings => ({ success: true, result: { bindings } });

test('rejects Cloudflare token as plaintext without disclosing its value', () => {
  const findings = validateBindingTypes(response([
    { name: 'CF_API_TOKEN', type: 'plain_text', text: 'never-log-this' },
    { name: 'GITHUB_APP_ID', type: 'secret_text' },
  ]));
  assert.equal(findings.ok, false);
  assert.deepEqual(findings.unsafe, [{ name: 'CF_API_TOKEN', type: 'plain_text' }]);
  assert.doesNotMatch(JSON.stringify(findings), /never-log-this/);
});

test('accepts secret credentials and ordinary public bindings', () => {
  const result = validateBindingTypes(response([
    { name: 'CF_API_TOKEN', type: 'secret_text' },
    { name: 'OPENAI_API_KEY', type: 'secret_text' },
    { name: 'ENVIRONMENT', type: 'plain_text', text: 'production' },
    { name: 'CHIEF_AI', type: 'service' },
  ]));
  assert.equal(result.ok, true);
});

test('fails closed on invalid, incomplete and duplicate provider settings', () => {
  assert.equal(validateBindingTypes({ success: false }).ok, false);
  assert.equal(validateBindingTypes(response([{ name: 'CF_API_TOKEN' }])).ok, false);
  assert.equal(validateBindingTypes(response([
    { name: 'ENVIRONMENT', type: 'plain_text' },
    { name: 'ENVIRONMENT', type: 'secret_text' },
  ])).ok, false);
});

test('rejects plain-text role keys, private keys, webhook secrets and OAuth secrets', () => {
  for (const name of [
    'SUPABASE_SERVICE_ROLE_KEY', 'GITHUB_PRIVATE_KEY',
    'FCR_WEBHOOK_SECRET', 'FCR_OAUTH_CLIENT_SECRET',
  ]) {
    const result = validateBindingTypes(response([{ name, type: 'plain_text', text: 'redacted' }]));
    assert.equal(result.ok, false, name);
  }
});

test('provider metadata fingerprint is stable and excludes plaintext binding values', async () => {
  const config = { CLOUDFLARE_API_TOKEN: 'test-only-token' };
  const provider = bindings => async () => ({
    ok: true,
    json: async () => response(bindings),
  });
  const base = [
    { name: 'FCR_MODE', type: 'plain_text', text: 'one' },
    { name: 'CF_API_TOKEN', type: 'secret_text' },
  ];
  const first = await runProviderPreflight({ env: config, fetchFn: provider(base) });
  const second = await runProviderPreflight({ env: config, fetchFn: provider([
    { name: 'CF_API_TOKEN', type: 'secret_text' },
    { name: 'FCR_MODE', type: 'plain_text', text: 'different-value' },
  ]) });
  assert.match(first.bindingFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.bindingFingerprint, second.bindingFingerprint);
  assert.doesNotMatch(JSON.stringify(first), /different-value|test-only-token/);
  const changed = await runProviderPreflight({ env: config, fetchFn: provider([
    { name: 'CF_API_TOKEN', type: 'secret_text' },
    { name: 'FCR_MODE', type: 'secret_text' },
  ]) });
  assert.notEqual(changed.bindingFingerprint, first.bindingFingerprint);
});
