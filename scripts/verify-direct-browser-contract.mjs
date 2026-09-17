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
const fiveScreenProofUrl = new URL('../e2e/five-screen-shell-proof.mjs', import.meta.url);
const fiveScreenProof = fs.readFileSync(fiveScreenProofUrl, 'utf8');
const fiveScreenShell = fs.readFileSync(new URL('../public/control-room/five-screen-shell.js', import.meta.url), 'utf8');
const opaqueBootstrap = fs.readFileSync(new URL('../public/control-room/opaque-session-bootstrap.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(bootstrap, /--no-proxy-server/);
assert.match(bootstrap, /delete process\.env\[key\]/);
assert.match(bootstrap, /process\.env\.NO_PROXY = '\*'/);
assert.match(bootstrap, /process\.env\.no_proxy = '\*'/);
assert.match(bootstrap, /const LEGACY_TAB_ROUTES = \{/);
assert.match(bootstrap, /missions: \{ screen: 'Control', view: 'Work' \}/);
assert.match(bootstrap, /terminal: \{ screen: 'Control', view: 'Execution' \}/);
assert.match(bootstrap, /async function driveFiveScreenNavigation/);
assert.match(bootstrap, /\.founder-screen-nav button/);
assert.match(bootstrap, /\.founder-subnav button/);
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
assert.match(fiveScreenProof, /from 'playwright'/);
assert.match(fiveScreenProof, /\['Home', 'Control', 'Chief', 'PromptOS', 'Proof'\]/);
assert.match(fiveScreenProof, /fcr_founder_context/);
assert.match(fiveScreenProof, /\?tab=activity/);
assert.match(fiveScreenProof, /desktop-context-restored/);
assert.match(fiveScreenProof, /mobile-proof/);
assert.match(fiveScreenShell, /const SCREENS = \[/);
assert.match(fiveScreenShell, /\['home', 'Home'\]/);
assert.match(fiveScreenShell, /\['control', 'Control'\]/);
assert.match(fiveScreenShell, /\['chief', 'Chief'\]/);
assert.match(fiveScreenShell, /\['promptos', 'PromptOS'\]/);
assert.match(fiveScreenShell, /\['proof', 'Proof'\]/);
assert.match(fiveScreenShell, /LEGACY_ROUTE_MAP/);
assert.match(fiveScreenShell, /CONTEXT_KEY/);
assert.match(opaqueBootstrap, /five-screen-shell\.js/);

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

execFileSync(process.execPath, [fileURLToPath(fiveScreenProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

console.log('direct browser contract verified with local, ULTRATHINK Plugin Center, Control Room Composer, five-screen cockpit, and legacy-journey navigation proofs');
