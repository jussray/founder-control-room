import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const bootstrap = fs.readFileSync(new URL('../e2e/direct-browser-run.mjs', import.meta.url), 'utf8');
const localPlaywrightProofUrl = new URL('../e2e/local-playwright-browser-proof.mjs', import.meta.url);
const localPlaywrightProof = fs.readFileSync(localPlaywrightProofUrl, 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(bootstrap, /--no-proxy-server/);
assert.match(bootstrap, /delete process\.env\[key\]/);
assert.match(bootstrap, /process\.env\.NO_PROXY = '\*'/);
assert.match(bootstrap, /process\.env\.no_proxy = '\*'/);
assert.equal(pkg.scripts['test:e2e'], 'npm run build && npm run verify:direct-browser && node e2e/pages-auth-callback-proof.mjs && node e2e/direct-browser-run.mjs');
assert.match(localPlaywrightProof, /from 'playwright'/);
assert.match(localPlaywrightProof, /LOCAL_NO_PROVIDER_FEE/);
assert.match(localPlaywrightProof, /providerWalletRequired: false/);
assert.doesNotMatch(localPlaywrightProof, /TinyFish/i);

execFileSync(process.execPath, [fileURLToPath(localPlaywrightProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

console.log('direct browser contract verified with local Playwright proof');
