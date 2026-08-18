import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const commandBridge = readFileSync('.github/workflows/fcr-cloudflare-command-bridge.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/fcr-access-front-door-recovery.yml', 'utf8');
const reconciliation = readFileSync('scripts/reconcile-cloudflare-access-public-zone.mjs', 'utf8');
const browserProof = readFileSync('scripts/verify-fcr-front-door-playwright.mjs', 'utf8');

const ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';

test('command bridge is founder-only, issue-scoped, and exact-main bound', () => {
  assert.match(commandBridge, /github\.event\.issue\.number == 485/);
  assert.match(commandBridge, /github\.event\.comment\.user\.login == 'jussray'/);
  assert.match(commandBridge, /actions:\s*write/);
  assert.match(commandBridge, /\/cloudflare-fcr-access/);
  assert.match(commandBridge, /commits\/main/);
  assert.match(commandBridge, /test "\$current_main" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(commandBridge, /fcr-access-front-door-recovery\.yml\/dispatches/);
});

test('recovery workflow is production-gated and separates read from mutation authority', () => {
  assert.match(recoveryWorkflow, /environment:\s*production/);
  assert.match(recoveryWorkflow, new RegExp(ACCOUNT_ID));
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_API_TOKEN/);
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.match(recoveryWorkflow, /if: inputs\.apply == true/);
  assert.match(recoveryWorkflow, /current_main.*EXPECTED_HEAD_SHA/s);
  assert.match(recoveryWorkflow, /verify-fcr-front-door-playwright\.mjs/);
});

test('recovery returns only a sanitized receipt to the fixed founder control issue', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized recovery receipt to founder control issue([\s\S]*)$/,
  )?.[1] ?? '';

  assert.match(recoveryWorkflow, /issues:\s*write/);
  assert.match(returnStep, /RETURN_ISSUE:\s*'485'/);
  assert.match(returnStep, /WORKFLOW_RUN_URL/);
  assert.match(returnStep, /gh issue comment "\$RETURN_ISSUE" --repo "\$GITHUB_REPOSITORY"/);
  assert.match(returnStep, /matchingApplicationCount/);
  assert.match(returnStep, /credentialFailures/);
  assert.match(returnStep, /apiVersionMatchesExpectedSha/);
  assert.match(returnStep, /jq -e 'type == "object"' "\$access_receipt"/);
  assert.match(returnStep, /jq -e 'type == "object"' "\$browser_receipt"/);
  assert.doesNotMatch(returnStep, /jq empty "\$access_receipt"/);
  assert.doesNotMatch(returnStep, /jq empty "\$browser_receipt"/);
  assert.match(returnStep, /Access provider receipt: `malformed`/);
  assert.match(returnStep, /Browser proof receipt: `malformed`/);
  assert.match(returnStep, /Provider truth: `UNKNOWN`/);
  assert.match(returnStep, /Browser proof: `UNKNOWN`/);
  assert.doesNotMatch(returnStep, /matchingApplications/);
  assert.doesNotMatch(returnStep, /cat "\$access_receipt"/);
  assert.doesNotMatch(returnStep, /cat "\$browser_receipt"/);
});

test('provider mutation is limited to the Access organization exemption update', () => {
  const putCalls = [...reconciliation.matchAll(/'PUT'/g)];
  assert.equal(putCalls.length, 1);
  assert.match(reconciliation, /\/access\/organizations/);
  assert.match(reconciliation, /deny_unmatched_requests_exempted_zone_names: nextExemptions/);
  assert.match(reconciliation, /explicit-access-application-match/);
  assert.doesNotMatch(reconciliation, /\/dns_records|\/routes|wrangler|supabase/i);
});

test('browser proof binds public origin and API runtime to the exact approved SHA', () => {
  assert.match(browserProof, /https:\/\/foundercontrolroom\.org/);
  assert.match(browserProof, /https:\/\/api\.foundercontrolroom\.org\/version/);
  assert.match(browserProof, /receipt\.finalOrigin !== WEB_ORIGIN/);
  assert.match(browserProof, /versionPayload\.includes\(expectedHeadSha\)/);
  assert.match(browserProof, /chromium\.launch/);
});
