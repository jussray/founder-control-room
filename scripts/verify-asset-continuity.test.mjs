import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixture = () => {
  const manifest = JSON.parse(readFileSync('config/asset-continuity.manifest.template.json', 'utf8'));
  manifest.assets[0].location = { type: 'external', reference: 'https://example.com/canonical-art' };
  return manifest;
};
function verify(manifest) {
  const dir = mkdtempSync(join(tmpdir(), 'asset-continuity-'));
  const file = join(dir, 'manifest.json');
  writeFileSync(file, JSON.stringify(manifest));
  return spawnSync(process.execPath, ['scripts/verify-asset-continuity.mjs', '--manifest', file], { cwd: root, encoding: 'utf8' });
}
test('accepts a complete external canonical asset without claiming runtime fidelity', () => {
  const result = verify(fixture());
  assert.equal(result.status, 0, result.stderr);
});
for (const field of ['location', 'provenance', 'fingerprint', 'status', 'allowedTransformations']) {
  test(`rejects a canonical asset missing ${field}`, () => {
    const manifest = fixture();
    delete manifest.assets[0][field];
    const result = verify(manifest);
    assert.equal(result.status, 1);
  });
}
test('rejects missing source authority', () => {
  const manifest = fixture();
  delete manifest.sourceAuthority;
  const result = verify(manifest);
  assert.equal(result.status, 1);
});
