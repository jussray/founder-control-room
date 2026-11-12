import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/build-pages.mjs', import.meta.url));

test('Cloudflare Pages build validator remains parseable by Node', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' }));
});
