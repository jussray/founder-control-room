import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/build-pages.mjs', import.meta.url));

test('Cloudflare Pages build validator remains parseable by Node', () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' }));
});

import { localAssetReferences } from '../scripts/pages-asset-references.mjs';

test('resolves relative, root-relative, and query-bearing local asset references', () => {
  const markup = `<!doctype html><html><head>
    <link rel="stylesheet" href="./quickscan.css">
    <script src="quickscan.js?v=2"></script>
    <script src="/missing.js?v=1#x"></script>
    <link rel="stylesheet" href="../shared/site.css">
    <link rel="canonical" href="https://www.foundercontrolroom.org/x">
    <script src="//cdn.example.com/a.js"></script>
    <link rel="icon" href="data:image/png;base64,AA==">
    <a href="#top"></a></head><body></body></html>`;
  assert.deepEqual(localAssetReferences(markup, 'control-room/quickscan.html').map(r => [r.path, r.escapes]), [
    ['control-room/quickscan.css', false],
    ['control-room/quickscan.js', false],
    ['missing.js', false],
    ['shared/site.css', false],
  ]);
});

test('flags references that resolve above the output root', () => {
  const refs = localAssetReferences('<script src="../../etc/passwd"></script>', 'control-room/page.html');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].escapes, true);
});
