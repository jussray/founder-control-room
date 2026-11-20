import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  evaluateVarSecretCollisions,
  findProviderVarSecretCollisions,
  findStaticVarSecretCollisions,
  main,
  parseSecretListReceipt,
  parseWorkerConfigNames,
} from './verify-worker-var-secret-collisions.mjs';

const SAMPLE = `
name = "founder-control-room"
[[services]]
binding = "SELF" # not a var
[vars]
ENVIRONMENT = "production"
SUPABASE_URL = "https://example.invalid" # trailing comment with "quote"
"QUOTED_VAR" = "x#not-a-comment"
FOUNDER_API_URL = "https://example.invalid"

[secrets]
required = [
  "SUPABASE_SERVICE_ROLE_KEY", # comment
  "OPENAI_API_KEY",
]
optional = ["FCR_GMAIL_CLIENT_ID", "MODEL_API_KEY"]

[env.staging.vars]
STAGING_ONLY = "1"

[triggers]
crons = ["* * * * *"]
`;

test('parses only top-level [vars] names and [secrets] registries', () => {
  const parsed = parseWorkerConfigNames(SAMPLE);
  assert.deepEqual(parsed.vars, ['ENVIRONMENT', 'SUPABASE_URL', 'QUOTED_VAR', 'FOUNDER_API_URL']);
  assert.deepEqual(parsed.secrets.required, ['SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']);
  assert.deepEqual(parsed.secrets.optional, ['FCR_GMAIL_CLIENT_ID', 'MODEL_API_KEY']);
});

test('static check is clean when [vars] and [secrets] are disjoint', () => {
  assert.deepEqual(findStaticVarSecretCollisions(parseWorkerConfigNames(SAMPLE)), []);
});

test('static check names a var that is also in [secrets].required or optional', () => {
  const toml = `${SAMPLE.replace('"OPENAI_API_KEY",', '"OPENAI_API_KEY",\n  "SUPABASE_URL",')}`
    .replace('"MODEL_API_KEY"]', '"MODEL_API_KEY", "ENVIRONMENT"]');
  assert.deepEqual(findStaticVarSecretCollisions(parseWorkerConfigNames(toml)), ['ENVIRONMENT', 'SUPABASE_URL']);
});

test('provider check names every [vars] name that already exists as a Worker secret', () => {
  const vars = ['ENVIRONMENT', 'SUPABASE_URL', 'FOUNDER_ALLOWED_ORIGINS', 'FOUNDER_API_URL'];
  const secrets = ['SUPABASE_SERVICE_ROLE_KEY', 'FOUNDER_API_URL', 'SUPABASE_URL', 'FOUNDER_ALLOWED_ORIGINS'];
  assert.deepEqual(findProviderVarSecretCollisions(vars, secrets), [
    'FOUNDER_ALLOWED_ORIGINS', 'FOUNDER_API_URL', 'SUPABASE_URL',
  ]);
  assert.deepEqual(findProviderVarSecretCollisions(vars, ['SUPABASE_SERVICE_ROLE_KEY']), []);
});

test('secret receipt parser tolerates wrangler progress lines and fails closed on garbage', () => {
  const receipt = 'Using token from env\n[{"name":"SUPABASE_URL","type":"secret_text"},{"name":"X","type":"secret_text"}]\n';
  assert.deepEqual(parseSecretListReceipt(receipt), ['SUPABASE_URL', 'X']);
  const noisy = '▲ [WARNING] something\n[{"name":"FOUNDER_API_URL","type":"secret_text"}]\n[wrangler] done\n';
  assert.deepEqual(parseSecretListReceipt(noisy), ['FOUNDER_API_URL']);
  assert.deepEqual(parseSecretListReceipt('[]'), []);
  assert.throws(() => parseSecretListReceipt('[{"type":"secret_text"}]'), /secret-receipt-invalid/);
  assert.throws(() => parseSecretListReceipt('Invalid access token [code: 9109'), /secret-receipt-invalid/);
  assert.throws(() => parseSecretListReceipt('no json here'), /secret-receipt-invalid/);
  assert.throws(() => parseSecretListReceipt('{"name":"X"}'), /secret-receipt-invalid/);
});

test('evaluate fails on provider collision and passes static-only on the sample', () => {
  const staticOnly = evaluateVarSecretCollisions({ tomlText: SAMPLE });
  assert.equal(staticOnly.ok, true);
  assert.equal(staticOnly.providerCollisions, null);
  const live = evaluateVarSecretCollisions({
    tomlText: SAMPLE,
    secretReceiptText: JSON.stringify([{ name: 'SUPABASE_URL', type: 'secret_text' }]),
  });
  assert.equal(live.ok, false);
  assert.deepEqual(live.providerCollisions, ['SUPABASE_URL']);
});

test('unterminated [secrets] array fails closed', () => {
  assert.throws(() => parseWorkerConfigNames('[secrets]\nrequired = [\n  "A",\n'), /secrets-required-array-unterminated/);
});

test('checked-in wrangler.worker.toml has no static [vars]/[secrets] collision', () => {
  const parsed = parseWorkerConfigNames(readFileSync('wrangler.worker.toml', 'utf8'));
  assert.ok(parsed.vars.includes('SUPABASE_URL'));
  assert.ok(parsed.secrets.required.includes('FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON'));
  assert.deepEqual(findStaticVarSecretCollisions(parsed), []);
});

test('CLI exits non-zero and names colliding names without printing values', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'fcr-var-secret-'));
  const receipt = join(dir, 'secrets.json');
  writeFileSync(receipt, JSON.stringify([
    { name: 'SUPABASE_URL', type: 'secret_text' },
    { name: 'FOUNDER_ALLOWED_ORIGINS', type: 'secret_text' },
    { name: 'FOUNDER_API_URL', type: 'secret_text' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', type: 'secret_text' },
  ]));
  const errors = [];
  const logs = [];
  const code = main(['--config', 'wrangler.worker.toml', '--secret-receipt', receipt], {
    log: (m) => logs.push(m), error: (m) => errors.push(m),
  });
  assert.equal(code, 1);
  const text = errors.join('\n');
  for (const name of ['SUPABASE_URL', 'FOUNDER_ALLOWED_ORIGINS', 'FOUNDER_API_URL']) assert.match(text, new RegExp(name));
  assert.doesNotMatch(text, /oojzfmmywbvficgybaxd|https:\/\//);
  assert.equal(logs.length, 0);

  const clean = join(dir, 'clean.json');
  writeFileSync(clean, '[{"name":"SUPABASE_SERVICE_ROLE_KEY","type":"secret_text"}]');
  assert.equal(main(['--secret-receipt', clean], { log: (m) => logs.push(m), error: (m) => errors.push(m) }), 0);
  assert.equal(main(['--secret-receipt', join(dir, 'missing.json')], { log: () => {}, error: () => {} }), 1);
});
