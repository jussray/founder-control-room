import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const commandBridge = readFileSync('.github/workflows/fcr-cloudflare-command-bridge.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/fcr-access-front-door-recovery.yml', 'utf8');
const reconciliation = readFileSync('scripts/reconcile-cloudflare-access-public-zone.mjs', 'utf8');
const browserProof = readFileSync('scripts/verify-fcr-front-door-playwright.mjs', 'utf8');

const ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';

function workflowSection(start, end) {
  return recoveryWorkflow.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1] ?? '';
}

test('command bridge is founder-only, issue-scoped, and exact-main bound', () => {
  assert.match(commandBridge, /github\.event\.issue\.number == 485/);
  assert.match(commandBridge, /github\.event\.comment\.user\.login == 'jussray'/);
  assert.match(commandBridge, /actions:\s*write/);
  assert.match(commandBridge, /\/cloudflare-fcr-access/);
  assert.match(commandBridge, /commits\/main/);
  assert.match(commandBridge, /test "\$current_main" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(commandBridge, /fcr-access-front-door-recovery\.yml\/dispatches/);
});

test('recovery workflow is production-gated and keeps read, apply, and rollback authority separate', () => {
  assert.match(recoveryWorkflow, /environment:\s*production/);
  assert.match(recoveryWorkflow, new RegExp(ACCOUNT_ID));
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_API_TOKEN/);
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.match(recoveryWorkflow, /if: inputs\.apply != true/);
  assert.match(recoveryWorkflow, /if: inputs\.apply == true/);
  assert.match(recoveryWorkflow, /current_main.*EXPECTED_HEAD_SHA/s);
  assert.match(recoveryWorkflow, /verify-fcr-front-door-playwright\.mjs/);
  const rollbackStep = workflowSection(
    '- name: Roll back only an incomplete provider apply',
    '- name: Install Chromium for stranger front-door proof',
  );
  assert.match(rollbackStep, /steps\.access_apply\.outcome == 'failure'/);
  assert.match(rollbackStep, /--rollback/);
  assert.doesNotMatch(rollbackStep, /browser|stranger/i);
});

test('authority gate never publishes a raw approval reference and states the product-auth boundary', () => {
  const authorityStep = workflowSection(
    '- name: Verify exact current main and mutation approval',
    '- name: Set up Node 24',
  );
  assert.match(authorityStep, /approval_reference_receipt='not-required-for-read-only'/);
  assert.match(authorityStep, /sha256sum/);
  assert.match(authorityStep, /approval_reference_receipt="sha256:/);
  assert.match(authorityStep, /apply=false must not carry approval_reference/);
  assert.match(authorityStep, /Product auth: FCR founder sign-in, not Cloudflare Access/);
  assert.match(authorityStep, /Cloudflare Access owns zero public destinations/);
  assert.match(authorityStep, /Preserved scope: all non-browser destinations and all existing policies remain unchanged/);
  assert.doesNotMatch(authorityStep, /Approval reference:.*APPROVAL_REFERENCE/);
});

test('raw provider and browser receipts stay ephemeral and suppressed from logs/artifacts', () => {
  assert.match(recoveryWorkflow, /reconcile-cloudflare-access-public-zone\.mjs >\/dev\/null 2>&1/);
  assert.match(recoveryWorkflow, /reconcile-cloudflare-access-public-zone\.mjs --apply >\/dev\/null 2>&1/);
  assert.match(recoveryWorkflow, /reconcile-cloudflare-access-public-zone\.mjs --rollback >\/dev\/null 2>&1/);
  assert.match(recoveryWorkflow, /verify-fcr-front-door-playwright\.mjs >\/dev\/null 2>&1/);
  const artifactStep = workflowSection(
    '- name: Upload sanitized recovery evidence',
    '- name: Fail closed after retaining provider and stranger evidence',
  );
  assert.match(artifactStep, /fcr-access-front-door-public-receipt/);
  assert.match(artifactStep, /path:\s*test-results\/fcr-access-front-door-public-receipt\.md/);
  assert.doesNotMatch(artifactStep, /fcr-access-front-door-recovery\.json/);
  assert.doesNotMatch(artifactStep, /fcr-access-front-door-browser-proof\.json/);
});

test('Access public receipt is schema-v3, exact-head bound, and exposes only bounded detachment fields', () => {
  const returnStep = workflowSection(
    '- name: Return sanitized recovery receipt to founder control issue',
    '- name: Upload sanitized recovery evidence',
  );
  assert.match(returnStep, /safe_expected_head_sha='UNKNOWN'/);
  assert.match(returnStep, /\.schemaVersion == 3/);
  assert.match(returnStep, /\.scope == "fcr-access-front-door-recovery"/);
  assert.match(returnStep, /\.desiredState == "fcr-product-auth-without-cloudflare-access-screen"/);
  assert.match(returnStep, /\.expectedHeadSha == \$expectedHeadSha/);
  assert.match(returnStep, /\.accountId == \$accountId/);
  assert.match(returnStep, /\.zone == "foundercontrolroom\.org"/);
  assert.match(returnStep, /\.action == "browser-access-already-detached"/);
  assert.match(returnStep, /\.action == "would-detach-browser-access"/);
  assert.match(returnStep, /\.action == "detached-browser-access"/);
  assert.match(returnStep, /\.action == "restored-browser-access-after-failed-provider-apply"/);
  assert.match(returnStep, /browserAccessDestinationCount/);
  assert.match(returnStep, /preservedNonBrowserDestinationCount/);
  assert.doesNotMatch(returnStep, /\n\s*(?:sourceApplicationId|originalDestinations|expectedPostDestinations|sourceIdentityFingerprint|sourcePolicyFingerprint)\s*[,}]/);
  assert.doesNotMatch(returnStep, /cat "\$access_receipt"/);
  assert.doesNotMatch(returnStep, /cat "\$browser_receipt"/);
});

test('browser receipt must pass one-document bounded schema before public projection', () => {
  const returnStep = workflowSection(
    '- name: Return sanitized recovery receipt to founder control issue',
    '- name: Upload sanitized recovery evidence',
  );
  assert.equal((returnStep.match(/jq -e -s/g) ?? []).length, 2);
  assert.equal((returnStep.match(/length == 1/g) ?? []).length, 2);
  assert.match(returnStep, /\.schemaVersion == 1/);
  assert.match(returnStep, /\.scope == "fcr-access-front-door-browser-proof"/);
  assert.match(returnStep, /\.expectedHeadSha == \$expectedHeadSha/);
  assert.match(returnStep, /\.audience == "random-stranger"/);
  assert.match(returnStep, /\.requestedOrigin == "https:\/\/foundercontrolroom\.org"/);
  assert.match(returnStep, /\.publicOrigin == "https:\/\/www\.foundercontrolroom\.org"/);
  assert.match(returnStep, /\.founderSignInVisible \| type == "boolean"/);
  assert.match(returnStep, /\.founderShellVisible \| type == "boolean"/);
  assert.match(returnStep, /\.founderAuthorityContained \| type == "boolean"/);
  assert.match(returnStep, /\.apiVersionMatchesExpectedSha \| type == "boolean"/);
  assert.match(returnStep, /\.state == "unknown" or \.state == "proven" or \.state == "failed"/);
  assert.match(returnStep, /Browser proof receipt: `malformed`/);
  assert.match(returnStep, /single-document public schema allowlist/);
});

test('provider mutation is update-only on one existing mixed Access application', () => {
  assert.match(reconciliation, /'PUT'/);
  assert.doesNotMatch(reconciliation, /'POST'/);
  assert.doesNotMatch(reconciliation, /'DELETE'/);
  assert.match(reconciliation, /public-only-access-app-requires-reviewed-deletion/);
  assert.match(reconciliation, /multiple-browser-access-apps-require-review/);
  assert.match(reconciliation, /withoutBrowserDestinations/);
  assert.match(reconciliation, /sourcePolicyFingerprint/);
  assert.match(reconciliation, /sourceIdentityFingerprint/);
  assert.match(reconciliation, /browser-access-source-drift-before-write/);
  assert.match(reconciliation, /mutationOutcome = 'not-attempted'/);
  assert.match(reconciliation, /rollbackFcrPublicAccessZone/);
  assert.doesNotMatch(reconciliation, /\/dns_records|\/routes|wrangler|supabase/i);
});

test('browser proof independently proves no Access interception, founder containment, and exact runtime identity', () => {
  assert.match(browserProof, /https:\/\/foundercontrolroom\.org/);
  assert.match(browserProof, /https:\/\/www\.foundercontrolroom\.org/);
  assert.match(browserProof, /https:\/\/api\.foundercontrolroom\.org\/version/);
  assert.match(browserProof, /cloudflareaccess\\\.com/i);
  assert.match(browserProof, /founderSignInVisible/);
  assert.match(browserProof, /founderShellVisible/);
  assert.match(browserProof, /authMeStatus !== 401/);
  assert.match(browserProof, /apiVersionMatchesExpectedSha/);
  assert.match(browserProof, /versionPayload\.includes\(expectedHeadSha\)/);
  assert.match(browserProof, /chromium\.launch/);
});
