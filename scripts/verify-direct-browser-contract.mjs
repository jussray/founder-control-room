import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const bootstrap = fs.readFileSync(new URL('../e2e/direct-browser-run.mjs', import.meta.url), 'utf8');
const localPlaywrightProofUrl = new URL('../e2e/local-playwright-browser-proof.mjs', import.meta.url);
const localPlaywrightProof = fs.readFileSync(localPlaywrightProofUrl, 'utf8');
const ultrathinkPluginProofUrl = new URL('../e2e/plugin-center-ultrathink-proof.mjs', import.meta.url);
const ultrathinkPluginProof = fs.readFileSync(ultrathinkPluginProofUrl, 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(bootstrap, /--no-proxy-server/);
assert.match(bootstrap, /delete process\.env\[key\]/);
assert.match(bootstrap, /process\.env\.NO_PROXY = '\*'/);
assert.match(bootstrap, /process\.env\.no_proxy = '\*'/);
assert.equal(pkg.scripts['test:e2e'], 'npm run build && npm run verify:direct-browser && node e2e/pages-auth-callback-proof.mjs && node e2e/direct-browser-run.mjs && node e2e/workspace-tenant-proof.mjs');
assert.match(localPlaywrightProof, /from 'playwright'/);
assert.match(localPlaywrightProof, /LOCAL_NO_PROVIDER_FEE/);
assert.match(localPlaywrightProof, /providerWalletRequired: false/);
assert.doesNotMatch(localPlaywrightProof, /providerWalletRequired:\s*true/);
assert.match(ultrathinkPluginProof, /from 'playwright'/);
assert.match(ultrathinkPluginProof, /data-plugin-id="ultrathink"/);
assert.match(ultrathinkPluginProof, /non-authorizing/);
assert.match(ultrathinkPluginProof, /plugin-center-ultrathink-/);

execFileSync(process.execPath, [fileURLToPath(localPlaywrightProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

execFileSync(process.execPath, [fileURLToPath(ultrathinkPluginProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

console.log('direct browser contract verified with local, ULTRATHINK Plugin Center, and workspace tenant Playwright proofs');
