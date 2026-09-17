import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const bootstrap = fs.readFileSync(new URL('../e2e/direct-browser-run.mjs', import.meta.url), 'utf8');
const localPlaywrightProofUrl = new URL('../e2e/local-playwright-browser-proof.mjs', import.meta.url);
const localPlaywrightProof = fs.readFileSync(localPlaywrightProofUrl, 'utf8');
const ultrathinkPluginProofUrl = new URL('../e2e/plugin-center-ultrathink-proof.mjs', import.meta.url);
const ultrathinkPluginProof = fs.readFileSync(ultrathinkPluginProofUrl, 'utf8');
const composerProofUrl = new URL('../e2e/control-room-composer-proof.mjs', import.meta.url);
const composerProof = fs.readFileSync(composerProofUrl, 'utf8');
const missionLiveProofUrl = new URL('../e2e/mission-live-ux-proof.mjs', import.meta.url);
const missionLiveProof = fs.readFileSync(missionLiveProofUrl, 'utf8');
const missionLiveUx = fs.readFileSync(new URL('../public/control-room/mission-live-ux.js', import.meta.url), 'utf8');
const stackRouter = fs.readFileSync(new URL('../public/control-room/stack-router.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(bootstrap, /--no-proxy-server/);
assert.match(bootstrap, /delete process\.env\[key\]/);
assert.match(bootstrap, /process\.env\.NO_PROXY = '\*'/);
assert.match(bootstrap, /process\.env\.no_proxy = '\*'/);
assert.equal(pkg.scripts['test:e2e'], 'npm run build && npm run verify:direct-browser && node e2e/pages-auth-callback-proof.mjs && node e2e/direct-browser-run.mjs');
assert.match(localPlaywrightProof, /from 'playwright'/);
assert.match(localPlaywrightProof, /LOCAL_NO_PROVIDER_FEE/);
assert.match(localPlaywrightProof, /providerWalletRequired: false/);
assert.doesNotMatch(localPlaywrightProof, /providerWalletRequired:\s*true/);
assert.match(ultrathinkPluginProof, /from 'playwright'/);
assert.match(ultrathinkPluginProof, /data-plugin-id="ultrathink"/);
assert.match(ultrathinkPluginProof, /non-authorizing/);
assert.match(ultrathinkPluginProof, /plugin-center-ultrathink-/);
assert.match(composerProof, /from 'playwright'/);
assert.match(composerProof, /What are you working on\?/);
assert.match(composerProof, /What do you need FCR to do\?/);
assert.match(composerProof, /composer-desktop/);
assert.match(composerProof, /composer-mobile/);
assert.match(composerProof, /submittedPayload\.controlRoom/);
assert.match(composerProof, /test-results\/control-room-composer/);
assert.match(missionLiveProof, /from 'playwright'/);
assert.match(missionLiveProof, /window\.refreshClicks > 0/);
assert.match(missionLiveProof, /proof-gate input survives shell re-render/);
assert.match(missionLiveProof, /mobile-live-status\.png/);
assert.match(missionLiveUx, /founderIsEditingMissionForm/);
assert.match(missionLiveUx, /boardSignatureFromTasks/);
assert.match(missionLiveUx, /Live status · paused while editing/);
assert.match(stackRouter, /import \{ installMissionLiveUx \} from '\.\/mission-live-ux\.js'/);
assert.match(stackRouter, /installMissionLiveUx\(\)/);

execFileSync(process.execPath, [fileURLToPath(localPlaywrightProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

execFileSync(process.execPath, [fileURLToPath(ultrathinkPluginProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

execFileSync(process.execPath, [fileURLToPath(composerProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

execFileSync(process.execPath, [fileURLToPath(missionLiveProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

console.log('direct browser contract verified with local, ULTRATHINK Plugin Center, Control Room Composer, and live mission UX Playwright proofs');
