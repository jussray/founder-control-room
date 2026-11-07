import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWranglerSecretRegistry } from '../scripts/wrangler-secret-registry.mjs';

test('parses required and optional Worker secret registries without crossing section boundaries', () => {
  const source = `
[secrets]
required = [
  "BOOT_REQUIRED",
]

optional = [
  "LEGACY_COMPAT_TOKEN",
]
`;

  const registry = parseWranglerSecretRegistry(source);

  assert.deepEqual(registry.required, ['BOOT_REQUIRED']);
  assert.deepEqual(registry.optional, ['LEGACY_COMPAT_TOKEN']);
  assert.equal(registry.required.includes('LEGACY_COMPAT_TOKEN'), false);
});

test('fails closed when the same secret appears in both registries', () => {
  const source = `
[secrets]
required = [
  "SHARED_SECRET",
]

optional = [
  "SHARED_SECRET",
]
`;

  assert.throws(
    () => parseWranglerSecretRegistry(source),
    /secret appears in both required and optional registries: SHARED_SECRET/,
  );
});

test('fails closed when either registry block is missing or malformed', () => {
  assert.throws(
    () => parseWranglerSecretRegistry('[secrets]\noptional = ["ONLY_OPTIONAL"]\n'),
    /missing \[secrets\]\.required registry/,
  );
  assert.throws(
    () => parseWranglerSecretRegistry('[secrets]\nrequired = ["ONLY_REQUIRED"]\n'),
    /missing \[secrets\]\.optional registry/,
  );
});
