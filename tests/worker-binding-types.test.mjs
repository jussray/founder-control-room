import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBindingTypes } from '../scripts/verify-worker-binding-types.mjs';

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
