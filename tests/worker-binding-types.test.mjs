import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBindingTypes, runProviderPreflight, isCredentialBindingName, PUBLIC_PLAINTEXT_BINDINGS, safePreflightError } from '../scripts/verify-worker-binding-types.mjs';
import { readFileSync } from 'node:fs';

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
    { name: 'ENVIRONMENT', type: 'plain_text', text: 'one' },
    { name: 'CF_API_TOKEN', type: 'secret_text' },
  ];
  const first = await runProviderPreflight({ env: config, fetchFn: provider(base) });
  const second = await runProviderPreflight({ env: config, fetchFn: provider([
    { name: 'CF_API_TOKEN', type: 'secret_text' },
    { name: 'ENVIRONMENT', type: 'plain_text', text: 'different-value' },
  ]) });
  assert.match(first.bindingFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.bindingFingerprint, second.bindingFingerprint);
  assert.doesNotMatch(JSON.stringify(first), /different-value|test-only-token/);
  const changed = await runProviderPreflight({ env: config, fetchFn: provider([
    { name: 'CF_API_TOKEN', type: 'secret_text' },
    { name: 'ENVIRONMENT', type: 'secret_text' },
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
  assert.equal(isCredentialBindingName('FCR_TOKENIZER_MODE'), false);
  assert.equal(isCredentialBindingName('REPOSITORY_KEYWORD'), false);
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

test('credential-word parsing closes suffixes, plurals and camelCase without substring false positives', () => {
  for (const name of ['API_TOKEN2', 'apiToken', 'SESSION_TOKENS', 'GITHUB_APP_PEM2', 'CFAPIToken', 'FCR_CREDENTIALS']) {
    assert.equal(isCredentialBindingName(name), true, name);
    assert.equal(validateBindingTypes(response([{ name, type: 'plain_text', text: 'fixture-value' }])).ok, false, name);
  }
  for (const name of ['MONKEY_MODE', 'FCR_TOKENIZER_MODE', 'REPOSITORY_KEYWORD']) {
    assert.equal(isCredentialBindingName(name), false, name);
  }
});

test('only explicitly reviewed Wrangler public vars may be plaintext; deny unknown names and JSON', () => {
  for (const name of ['ENVIRONMENT', 'FOUNDER_API_URL', 'N8N_FOUNDER_CONTENT_ENABLED']) {
    assert.equal(validateBindingTypes(response([{ name, type: 'plain_text', text: 'public-fixture' }])).ok, true, name);
  }
  for (const name of ['CONFIG_DATA', 'MONKEY_MODE', 'REPOSITORY_KEYWORD']) {
    const result = validateBindingTypes(response([{ name, type: 'plain_text', text: 'fixture-secret-not-for-logs' }]));
    assert.equal(result.ok, false, name);
    assert.equal(result.reason, 'undeclared-plaintext-binding', name);
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret-not-for-logs/);
  }
  const jsonBinding = validateBindingTypes(response([{ name: 'ENVIRONMENT', type: 'json', json: '{"nested":"fixture-secret"}' }]));
  assert.equal(jsonBinding.ok, false);
  assert.equal(jsonBinding.reason, 'json-config-binding-not-reviewed');
  assert.doesNotMatch(JSON.stringify(jsonBinding), /fixture-secret/);
});

test('reviewed plaintext binding allowlist matches exactly the source-authored Wrangler vars', () => {
  const toml = readFileSync(new URL('../wrangler.worker.toml', import.meta.url), 'utf8');
  const section = toml.split(/(?:^|\n)\[vars\]\s*\n/)[1]?.split(/\n\[/)[0];
  assert.ok(section, 'missing [vars] section');
  const declared = section.split(/\r?\n/).map(line => line.match(/^([A-Z][A-Z0-9_]*)\s*=/)?.[1]).filter(Boolean);
  assert.deepEqual([...PUBLIC_PLAINTEXT_BINDINGS].sort(), declared.sort());
  assert.equal(PUBLIC_PLAINTEXT_BINDINGS.every(name => !isCredentialBindingName(name)), true);
});

test('legacy one-binding removal exception cannot excuse undeclared plaintext', () => {
  const findings = validateBindingTypes(response([
    { name: 'CF_API_TOKEN', type: 'plain_text', text: 'fixture-private' },
    { name: 'CONFIG_DATA', type: 'plain_text', text: 'fixture-private-2' },
  ]), { allowStaleCfApiTokenRemoval: true });
  assert.equal(findings.ok, false);
  assert.equal(findings.repairableStaleCfApiToken, false);
  assert.equal(safePreflightError(new Error('undeclared-plaintext-binding')), 'undeclared-plaintext-binding');
  assert.equal(safePreflightError(new Error('json-config-binding-not-reviewed')), 'json-config-binding-not-reviewed');
  assert.doesNotMatch(JSON.stringify(findings), /fixture-private/);
});

test('unknown provider binding type cannot bypass checks with an innocent name', () => {
  for (const type of ['plaintext', 'json_value', 'unexpected_type']) {
    const finding = validateBindingTypes(response([{ name: 'CONFIG_DATA', type, text: 'fixture-private' }]));
    assert.equal(finding.ok, false, type);
    assert.equal(finding.reason, 'unrecognized-binding-type', type);
    assert.doesNotMatch(JSON.stringify(finding), /fixture-private/);
  }
  for (const type of ['service', 'workflow', 'send_email']) {
    assert.equal(validateBindingTypes(response([{ name: 'CHIEF_AI', type }])).ok, true, type);
  }
  assert.equal(validateBindingTypes(response([{ name: '', type: 'secret_text' }])).ok, false);
});
