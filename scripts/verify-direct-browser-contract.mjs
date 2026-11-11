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
const operatorRelayProofUrl = new URL('../e2e/operator-relay-proof.mjs', import.meta.url);
const operatorRelayProof = fs.readFileSync(operatorRelayProofUrl, 'utf8');
const fiveScreenProofUrl = new URL('../e2e/five-screen-shell-proof.mjs', import.meta.url);
const fiveScreenProof = fs.readFileSync(fiveScreenProofUrl, 'utf8');
const localFirstFounderProofUrl = new URL('../e2e/founder-local-first-proof.mjs', import.meta.url);
const localFirstFounderProof = fs.readFileSync(localFirstFounderProofUrl, 'utf8');
const osTopologyProofUrl = new URL('../e2e/founder-os-topology-proof.mjs', import.meta.url);
const osTopologyProof = fs.readFileSync(osTopologyProofUrl, 'utf8');
const rateLimitProofUrl = new URL('../e2e/safe-rate-limit-fetch-proof.mjs', import.meta.url);
const rateLimitProof = fs.readFileSync(rateLimitProofUrl, 'utf8');
const fiveScreenShell = fs.readFileSync(new URL('../public/control-room/five-screen-shell.js', import.meta.url), 'utf8');
const localFirstFounderState = fs.readFileSync(new URL('../public/control-room/local-first-founder-state.js', import.meta.url), 'utf8');
const osTopology = fs.readFileSync(new URL('../public/control-room/os-topology.js', import.meta.url), 'utf8');
const safeRateLimitFetch = fs.readFileSync(new URL('../public/control-room/safe-rate-limit-fetch.js', import.meta.url), 'utf8');
const opaqueBootstrap = fs.readFileSync(new URL('../public/control-room/opaque-session-bootstrap.js', import.meta.url), 'utf8');
const visualParityProofUrl = new URL('../e2e/control-room-visual-parity-proof.mjs', import.meta.url);
const visualParityProof = fs.readFileSync(visualParityProofUrl, 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(bootstrap, /--no-proxy-server/);
assert.match(bootstrap, /delete process\.env\[key\]/);
assert.match(bootstrap, /process\.env\.NO_PROXY = '\*'/);
assert.match(bootstrap, /process\.env\.no_proxy = '\*'/);
assert.equal(pkg.scripts['test:e2e'], 'npm run build && npm run verify:direct-browser && node e2e/pages-auth-callback-proof.mjs && node e2e/direct-browser-run.mjs && node e2e/truth-console-proof.mjs');
assert.match(localPlaywrightProof, /from 'playwright'/);
assert.match(localPlaywrightProof, /LOCAL_NO_PROVIDER_FEE/);
assert.match(localPlaywrightProof, /providerWalletRequired: false/);
assert.doesNotMatch(localPlaywrightProof, /providerWalletRequired:\s*true/);
assert.match(localPlaywrightProof, /evidenceScope: 'synthetic-dom-fixture'/);
assert.match(localPlaywrightProof, /fixtureFormMutationProved:\s*true/);
assert.match(localPlaywrightProof, /providerAccepted:\s*false/);
assert.match(localPlaywrightProof, /verifiedOutcome:\s*false/);
assert.doesNotMatch(localPlaywrightProof, /providerAccepted:\s*true/);
assert.doesNotMatch(localPlaywrightProof, /verifiedOutcome:\s*true/);
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
assert.match(operatorRelayProof, /SOURCE_WIRED_LIVE_UNPROVEN/);
assert.match(operatorRelayProof, /canonicalPath: '\/mcp'/);
assert.match(operatorRelayProof, /standaloneHttpRoute: 'UNMOUNTED_TEST_SCAFFOLD'/);
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

assert.match(localFirstFounderProof, /from 'playwright'/);
assert.match(localFirstFounderProof, /setOffline\(true\)/);
assert.match(localFirstFounderProof, /fcr_founder_local_first_outbox_v1/);
assert.match(localFirstFounderProof, /fresh-tab-restored/);
assert.match(localFirstFounderProof, /leakedSession/);
assert.match(localFirstFounderState, /FOUNDER_LOCAL_FIRST_VERSION = 1/);
assert.match(localFirstFounderState, /const ALLOWED_KEYS = Object\.freeze\(\[SCREEN_KEY, VIEW_KEY, CONTEXT_KEY\]\)/);
assert.match(localFirstFounderState, /scope: 'founder-workspace'/);
assert.match(localFirstFounderState, /restoreFounderLocalState/);
assert.match(localFirstFounderState, /snapshotFounderLocalState/);
assert.doesNotMatch(localFirstFounderState, /fcr_session/);

assert.match(osTopologyProof, /from 'playwright'/);
assert.match(osTopologyProof, /fcr\/os-topology@v1/);
assert.match(osTopologyProof, /EXPECTED_SYSTEMS/);
assert.match(osTopologyProof, /authority-transfer/);
assert.match(osTopologyProof, /only rendered authority owner/);
assert.match(osTopologyProof, /L99 stays a Chief operating method/);
assert.match(osTopology, /FCR_OS_TOPOLOGY_CONTRACT = 'fcr\/os-topology@v1'/);
assert.match(osTopology, /id: 'ultrathink'/);
assert.match(osTopology, /id: 'promptos'/);
assert.match(osTopology, /id: 'chief-ai-machine'/);
assert.match(osTopology, /id: 'founder-control-room'/);
assert.match(osTopology, /id: 'project-runtime'/);
assert.match(osTopology, /id: 'evidence-trust'/);
assert.match(osTopology, /id: 'solcontinuity'/);
assert.doesNotMatch(osTopology, /authorityTransfer:\s*true/);
assert.match(osTopology, /recipientVerificationRequired:\s*true/);
assert.match(osTopology, /L99 stays a Chief operating method, not a rival control plane/);

assert.match(rateLimitProof, /safe same-origin GET retries exactly once/);
assert.match(rateLimitProof, /consequential POST is never retried automatically/);
assert.match(rateLimitProof, /cross-origin response is never retried/);
assert.match(rateLimitProof, /unbounded Retry-After remains a visible 429/);
assert.match(safeRateLimitFetch, /SAFE_METHODS = new Set\(\['GET', 'HEAD'\]\)/);
assert.match(safeRateLimitFetch, /MAX_RETRY_AFTER_SECONDS = 61/);
assert.match(safeRateLimitFetch, /first\.status !== 429/);
assert.doesNotMatch(safeRateLimitFetch, /SAFE_METHODS = .*POST/);
assert.match(opaqueBootstrap, /safe-rate-limit-fetch\.js/);
assert.match(opaqueBootstrap, /local-first-founder-state\.js/);
assert.match(opaqueBootstrap, /installFounderLocalFirstState/);
assert.match(opaqueBootstrap, /five-screen-shell\.js/);
assert.match(opaqueBootstrap, /os-topology\.js/);

execFileSync(process.execPath, [fileURLToPath(rateLimitProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

// Deterministic negative-case proof for real 429 reset observation in the full E2E journey.
execFileSync(process.execPath, ['--test', fileURLToPath(new URL('../e2e/rate-limit-headroom.test.mjs', import.meta.url))], {
  stdio: 'inherit',
  env: process.env,
});
assert.match(visualParityProof, /from 'playwright'/);
assert.match(visualParityProof, /controlRoomVisualBridge/);
assert.match(visualParityProof, /desktop project choices use the canonical four-column card rhythm/);
assert.match(visualParityProof, /mobile onboarding condenses to two premium cards per row/);

execFileSync(process.execPath, [fileURLToPath(localPlaywrightProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

const fixtureReceipt = JSON.parse(fs.readFileSync(
  new URL('../artifacts/browser/local-playwright/local-playwright-proof.json', import.meta.url),
  'utf8',
));
assert.equal(fixtureReceipt.contract, 'fcr/local-playwright-browser-fixture@v2');
assert.equal(fixtureReceipt.evidenceScope, 'synthetic-dom-fixture');
assert.equal(fixtureReceipt.fixtureFormMutationProved, true);
assert.equal(fixtureReceipt.formMutationProved, false);
assert.equal(fixtureReceipt.providerAccepted, false);
assert.equal(fixtureReceipt.verifiedOutcome, false);

execFileSync(process.execPath, [fileURLToPath(ultrathinkPluginProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

execFileSync(process.execPath, [fileURLToPath(composerProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

execFileSync(process.execPath, [fileURLToPath(operatorRelayProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});
execFileSync(process.execPath, [fileURLToPath(fiveScreenProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});
execFileSync(process.execPath, [fileURLToPath(visualParityProofUrl)], {
  stdio: 'inherit',
  env: process.env,
});

console.log('direct browser contract verified: safe-read recovery, local proof, ULTRATHINK, Composer, five-screen navigation, offline state, OS topology, visual parity, operator relay, Truth Console contract');
