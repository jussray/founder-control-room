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
  assert.match(recoveryWorkflow, /if: inputs\.apply != true/);
  assert.match(recoveryWorkflow, /if: inputs\.apply == true/);
  assert.match(recoveryWorkflow, /current_main.*EXPECTED_HEAD_SHA/s);
  assert.match(recoveryWorkflow, /verify-fcr-front-door-playwright\.mjs/);
  assert.match(recoveryWorkflow, /--rollback/);
  assert.match(recoveryWorkflow, /failure\(\) && inputs\.apply == true/);
});

test('authority gate never publishes a raw approval reference', () => {
  const authorityStep = recoveryWorkflow.match(
    /- name: Verify exact current main and mutation approval([\s\S]*?)- name: Set up Node 24/,
  )?.[1] ?? '';

  assert.match(authorityStep, /approval_reference_receipt='not-required-for-read-only'/);
  assert.match(authorityStep, /sha256sum/);
  assert.match(authorityStep, /approval_reference_receipt="sha256:/);
  assert.match(authorityStep, /apply=false must not carry approval_reference/);
  assert.match(authorityStep, /Approval reference receipt: \\`\$approval_reference_receipt\\`/);
  assert.doesNotMatch(authorityStep, /Approval reference: \\`\$APPROVAL_REFERENCE\\`/);
  assert.match(authorityStep, /foundercontrolroom\.org\/\*/);
  assert.match(authorityStep, /Existing all-workers protection: preserved/);
});

test('raw recovery receipts remain ephemeral and are suppressed from workflow logs', () => {
  assert.match(
    recoveryWorkflow,
    /node scripts\/reconcile-cloudflare-access-public-zone\.mjs >\/dev\/null 2>&1/,
  );
  assert.match(
    recoveryWorkflow,
    /node scripts\/reconcile-cloudflare-access-public-zone\.mjs --apply >\/dev\/null 2>&1/,
  );
  assert.match(
    recoveryWorkflow,
    /node scripts\/reconcile-cloudflare-access-public-zone\.mjs --rollback >\/dev\/null 2>&1/,
  );
  assert.match(
    recoveryWorkflow,
    /node scripts\/verify-fcr-front-door-playwright\.mjs >\/dev\/null 2>&1/,
  );
});

test('always-path output independently sanitizes the requested head before publication', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized recovery receipt to founder control issue([\s\S]*?)- name: Upload sanitized recovery evidence/,
  )?.[1] ?? '';
  const artifactStep = recoveryWorkflow.match(
    /- name: Upload sanitized recovery evidence([\s\S]*)$/,
  )?.[1] ?? '';

  assert.match(returnStep, /safe_expected_head_sha='UNKNOWN'/);
  assert.match(returnStep, /\[\[ "\$EXPECTED_HEAD_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(returnStep, /safe_expected_head_sha="\$EXPECTED_HEAD_SHA"/);
  assert.match(returnStep, /Exact head: \\`\$safe_expected_head_sha\\`/);
  assert.doesNotMatch(returnStep, /Exact head: \\`\$EXPECTED_HEAD_SHA\\`/);
  assert.match(returnStep, /\[\[ "\$safe_expected_head_sha" == 'UNKNOWN' \]\]/);
  assert.match(returnStep, /--arg expectedHeadSha "\$safe_expected_head_sha"/);
  assert.match(artifactStep, /name:\s*fcr-access-front-door-public-receipt-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.doesNotMatch(artifactStep, /EXPECTED_HEAD_SHA/);
});

test('public receipt validators and projections require exactly one parsed JSON document', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized recovery receipt to founder control issue([\s\S]*?)- name: Upload sanitized recovery evidence/,
  )?.[1] ?? '';

  assert.equal((returnStep.match(/jq -e -s/g) ?? []).length, 2);
  assert.equal((returnStep.match(/length == 1/g) ?? []).length, 2);
  assert.equal((returnStep.match(/jq -s '\.\[0\] \| \{/g) ?? []).length, 2);
  assert.match(returnStep, /single-document public schema allowlist/);
});

test('Access receipt schema allows only bounded scoped public-bypass outcomes', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized recovery receipt to founder control issue([\s\S]*?)- name: Upload sanitized recovery evidence/,
  )?.[1] ?? '';

  assert.match(returnStep, /\.schemaVersion == 2/);
  assert.match(returnStep, /\.scope == "fcr-access-front-door-recovery"/);
  assert.match(returnStep, /\.expectedHeadSha == \$expectedHeadSha/);
  assert.match(returnStep, /\.accountId == \$accountId/);
  assert.match(returnStep, /\.zone == "foundercontrolroom\.org"/);
  assert.match(returnStep, /\.state == "mutated-needs-browser-proof"/);
  assert.match(returnStep, /\.applyRequested \| type == "boolean"/);
  assert.match(returnStep, /\.mutationPerformed \| type == "boolean"/);
  assert.match(returnStep, /\.rollbackPerformed \| type == "boolean"/);
  assert.match(returnStep, /\.credentialSource \| credential_source/);
  assert.match(returnStep, /\.credentialFailures \| type == "array" and all\(\.\[\]; credential_failure\)/);
  assert.match(returnStep, /\.source == "CLOUDFLARE_ACCESS_API_TOKEN"/);
  assert.match(returnStep, /\.source == "CLOUDFLARE_ACCESS_ADMIN_API_TOKEN"/);
  assert.match(returnStep, /\.reason == "provider-read-failed"/);
  assert.match(returnStep, /\.providerCodes \| type == "array" and all/);
  assert.match(returnStep, /\.matchingApplicationCount == null/);
  assert.match(returnStep, /\.action == "would-create-public-bypass"/);
  assert.match(returnStep, /\.action == "created-public-bypass"/);
  assert.match(returnStep, /\.action == "rolled-back-public-bypass"/);
  assert.match(returnStep, /\.classification == "existing-public-access-app-requires-review"/);
  assert.match(returnStep, /\.classification == "rollback-managed-app-drift"/);
  assert.match(returnStep, /failed the single-document public schema allowlist/);
});

test('browser receipt must pass a bounded field schema before derived public booleans', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized recovery receipt to founder control issue([\s\S]*?)- name: Upload sanitized recovery evidence/,
  )?.[1] ?? '';

  assert.match(returnStep, /\.schemaVersion == 1/);
  assert.match(returnStep, /\.scope == "fcr-access-front-door-browser-proof"/);
  assert.match(returnStep, /\.expectedHeadSha == \$expectedHeadSha/);
  assert.match(returnStep, /\.requestedOrigin == "https:\/\/foundercontrolroom\.org"/);
  assert.match(returnStep, /def origin_or_null:/);
  assert.match(returnStep, /\.finalOrigin \| origin_or_null/);
  assert.match(returnStep, /def status_or_null:/);
  assert.match(returnStep, /\.navigationStatus \| status_or_null/);
  assert.match(returnStep, /\.apiVersionStatus \| status_or_null/);
  assert.match(returnStep, /\.apiVersionMatchesExpectedSha \| type == "boolean"/);
  assert.match(returnStep, /\.state == "unknown" or \.state == "proven" or \.state == "failed"/);
  assert.match(returnStep, /has\("error"\)/);
  assert.match(returnStep, /\.error \| type == "string" and length <= 2000/);
  assert.doesNotMatch(returnStep, /\| tostring/);
  assert.match(returnStep, /finalOriginMatchesExpected/);
  assert.match(returnStep, /unexpectedOriginDetected/);
  assert.match(returnStep, /accessInterceptDetected/);
  assert.match(returnStep, /errorPresent/);
});

test('recovery returns only bounded sanitized fields to fixed issue and summary', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized recovery receipt to founder control issue([\s\S]*?)- name: Upload sanitized recovery evidence/,
  )?.[1] ?? '';

  assert.match(recoveryWorkflow, /issues:\s*write/);
  assert.match(returnStep, /RETURN_ISSUE:\s*'485'/);
  assert.match(returnStep, /WORKFLOW_RUN_URL/);
  assert.match(returnStep, /public_receipt='test-results\/fcr-access-front-door-public-receipt\.md'/);
  assert.match(returnStep, /gh issue comment "\$RETURN_ISSUE" --repo "\$GITHUB_REPOSITORY" --body-file "\$public_receipt"/);
  assert.match(returnStep, /cat "\$public_receipt" >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(returnStep, /matchingApplicationCount/);
  assert.match(returnStep, /credentialFailures/);
  assert.match(returnStep, /rollbackPerformed/);
  assert.match(returnStep, /apiVersionMatchesExpectedSha/);
  assert.match(returnStep, /Access provider receipt: `malformed`/);
  assert.match(returnStep, /Browser proof receipt: `malformed`/);
  assert.match(returnStep, /Provider truth: `UNKNOWN`/);
  assert.match(returnStep, /Browser proof: `UNKNOWN`/);
  assert.doesNotMatch(returnStep, /matchingApplications/);
  assert.doesNotMatch(returnStep, /\n\s*managedApplicationId,?\s*\n/);
  assert.doesNotMatch(returnStep, /\n\s*finalOrigin,\s*\n/);
  assert.doesNotMatch(returnStep, /\n\s*error\s*\n/);
  assert.doesNotMatch(returnStep, /\n\s*blocker,\s*\n/);
  assert.doesNotMatch(returnStep, /\n\s*nextAction\s*[,}]?/);
  assert.doesNotMatch(returnStep, /cat "\$access_receipt"/);
  assert.doesNotMatch(returnStep, /cat "\$browser_receipt"/);
});

test('artifact persistence contains only the sanitized public receipt', () => {
  const artifactStep = recoveryWorkflow.match(
    /- name: Upload sanitized recovery evidence([\s\S]*)$/,
  )?.[1] ?? '';

  assert.match(artifactStep, /fcr-access-front-door-public-receipt/);
  assert.match(artifactStep, /path:\s*test-results\/fcr-access-front-door-public-receipt\.md/);
  assert.doesNotMatch(artifactStep, /fcr-access-front-door-recovery\.json/);
  assert.doesNotMatch(artifactStep, /fcr-access-front-door-browser-proof\.json/);
});

test('provider mutation is limited to exact public Access application create/delete', () => {
  assert.doesNotMatch(reconciliation, /'PUT'/);
  assert.match(reconciliation, /'POST'/);
  assert.match(reconciliation, /'DELETE'/);
  assert.match(reconciliation, /destinations: \[\{ type: 'public', uri: `\$\{zone\}\/\*` \}\]/);
  assert.match(reconciliation, /decision: 'bypass'/);
  assert.match(reconciliation, /include: \[\{ everyone: \{\} \}\]/);
  assert.match(reconciliation, /existing-public-access-app-requires-review/);
  assert.match(reconciliation, /rollbackFcrPublicAccessZone/);
  assert.doesNotMatch(reconciliation, /deny_unmatched_requests_exempted_zone_names/);
  assert.doesNotMatch(reconciliation, /\/dns_records|\/routes|wrangler|supabase/i);
});

test('browser proof binds public origin and API runtime to the exact approved SHA', () => {
  assert.match(browserProof, /https:\/\/foundercontrolroom\.org/);
  assert.match(browserProof, /https:\/\/api\.foundercontrolroom\.org\/version/);
  assert.match(browserProof, /receipt\.finalOrigin !== WEB_ORIGIN/);
  assert.match(browserProof, /versionPayload\.includes\(expectedHeadSha\)/);
  assert.match(browserProof, /chromium\.launch/);
});
