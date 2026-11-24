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

test('bounded repair mode tolerates only the sole legacy CF_API_TOKEN plaintext binding', async () => {
  const bindings = [
    { name: 'CF_API_TOKEN', type: 'plain_text', text: 'never-log-this-either' },
    { name: 'GITHUB_APP_ID', type: 'secret_text' },
  ];
  const repairable = validateBindingTypes(response(bindings), { allowStaleCfApiTokenRemoval: true });
  assert.equal(repairable.ok, true);
  assert.equal(repairable.reason, 'repairable-stale-cf-api-token-plaintext');
  assert.equal(repairable.repairableStaleCfApiToken, true);
  assert.doesNotMatch(JSON.stringify(repairable), /never-log-this-either/);

  const extraUnsafe = validateBindingTypes(response([
    ...bindings,
    { name: 'GITHUB_PRIVATE_KEY', type: 'plain_text', text: 'still-blocked' },
  ]), { allowStaleCfApiTokenRemoval: true });
  assert.equal(extraUnsafe.ok, false);
  assert.equal(extraUnsafe.reason, 'credential-binding-not-secret');

  const otherCredential = validateBindingTypes(response([
    { name: 'OTHER_API_TOKEN', type: 'plain_text', text: 'still-blocked' },
  ]), { allowStaleCfApiTokenRemoval: true });
  assert.equal(otherCredential.ok, false);

  const preflight = await runProviderPreflight({
    env: {
      CLOUDFLARE_API_TOKEN: 'test-only-token',
      FCR_ALLOW_STALE_CF_API_TOKEN_REMOVAL: 'true',
    },
    fetchFn: async () => ({ ok: true, json: async () => response(bindings) }),
  });
  assert.equal(preflight.repairableStaleCfApiToken, true);
  assert.doesNotMatch(JSON.stringify(preflight), /never-log-this-either|test-only-token/);
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

test('rejects plaintext encoded credential and PEM bindings', () => {
  for (const name of [
    'GITHUB_PRIVATE_KEY_PEM',
    'FCR_AUTH_TOKEN_BASE64',
    'SERVICE_ACCOUNT_KEY_B64',
  ]) {
    const verdict = validateBindingTypes(response([{ name, type: 'plain_text', text: 'fixture-only' }]));
    assert.equal(verdict.ok, false, name);
  }
});

test('rejects plaintext credential version aliases and backups', () => {
  for (const name of [
    'CF_API_TOKEN_BACKUP',
    'OAUTH_CLIENT_SECRET_V2',
    'DATABASE_PASSWORD_ROTATED',
  ]) {
    const result = validateBindingTypes(response([{ name, type: 'plain_text', text: 'fixture-value' }]));
    assert.equal(result.ok, false, name);
  }
});

test('fails closed on MCP read tokens and generic secret credential names', () => {
  for (const name of [
    'FCR_REMOTE_MCP_READ_TOKEN',
    'FCR_SESSION_SIGNING_CREDENTIAL',
    'FCR_ROTATION_TOKEN',
    'FCR_CSRF_HMAC',
    'FCR_SERVICE_PEM',
    'FCR_SIGNING_SEED',
  ]) {
    const result = validateBindingTypes(response([{ name, type: 'plain_text', text: 'sensitive-fixture' }]));
    assert.equal(result.ok, false, name);
  }
  assert.equal(validateBindingTypes(response([
    { name: 'FCR_TOKENIZER_MODE', type: 'plain_text', text: 'enabled' },
    { name: 'REPOSITORY_KEYWORD', type: 'plain_text', text: 'guide' },
  ])).ok, true);
});

test('preflight failures never propagate response bodies, credentials, or untrusted binding names into CI logs', async () => {
  const { safePreflightError } = await import('../scripts/verify-worker-binding-types.mjs');
  const sensitive = 'sensitive-response-snippet';
  assert.equal(safePreflightError(new Error(`Unexpected token near ${sensitive}`)), 'provider-preflight-failed');
  assert.equal(safePreflightError(new Error(`credential-binding-not-secret: CF_TOKEN_${sensitive}(plain_text)`)), 'provider-preflight-failed');
  assert.equal(safePreflightError(new Error('provider-settings-http-403')), 'provider-settings-http-403');
  assert.equal(safePreflightError(new Error(`provider-settings-http-403 ${sensitive}`)), 'provider-preflight-failed');
  assert.equal(safePreflightError({ toString: () => sensitive }), 'provider-preflight-failed');
});

test('provider JSON parsing errors and unsafe binding names do not reveal response content to callers', async () => {
  const env = { CLOUDFLARE_API_TOKEN: 'fixture-token' };
  const secret = 'sensitive-blob-NEVER-LOG';
  await assert.rejects(
    runProviderPreflight({ env, fetchFn: async () => ({ ok: true, json: async () => { throw Error('parse: ' + secret); } }) }),
    { message: 'provider-response-invalid' },
  );
  await assert.rejects(
    runProviderPreflight({ env, fetchFn: async () => ({ ok: true, json: async () => response([{ name: 'CF_API_TOKEN_' + secret, type: 'plain_text' }]) }) }),
    { message: 'credential-binding-not-secret' },
  );
});
