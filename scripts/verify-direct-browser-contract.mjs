import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap = fs.readFileSync(new URL('../e2e/direct-browser-run.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(bootstrap, /--no-proxy-server/);
assert.match(bootstrap, /delete process\.env\[key\]/);
assert.match(bootstrap, /process\.env\.NO_PROXY = '\*'/);
assert.match(bootstrap, /process\.env\.no_proxy = '\*'/);
assert.equal(pkg.scripts['test:e2e'], 'npm run build && npm run verify:direct-browser && node e2e/direct-browser-run.mjs');

console.log('direct browser contract verified');
