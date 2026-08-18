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
