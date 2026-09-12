import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const commandBridge = readFileSync('.github/workflows/fcr-cloudflare-command-bridge.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/fcr-access-front-door-recovery.yml', 'utf8');
const reconciliation = readFileSync('scripts/reconcile-cloudflare-access-public-zone.mjs', 'utf8');
const splitKernel = readFileSync('scripts/fcr-access-public-worker-split.mjs', 'utf8');
const splitCli = readFileSync('scripts/fcr-access-public-worker-split-cli.mjs', 'utf8');
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
  assert.match(recoveryWorkflow, /fcr-access-public-worker-split-cli\.mjs apply/);
  assert.match(recoveryWorkflow, /fcr-access-public-worker-split-cli\.mjs rollback/);
  assert.doesNotMatch(recoveryWorkflow, /reconcile-cloudflare-access-public-zone\.mjs --apply/);
  assert.doesNotMatch(recoveryWorkflow, /reconcile-cloudflare-access-public-zone\.mjs --rollback/);
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
  assert.match(authorityStep, /www\.foundercontrolroom\.org\/\*/);
  assert.match(authorityStep, /api\.foundercontrolroom\.org\/version/);
  assert.match(authorityStep, /every other Worker route remains behind Access/);
  assert.match(authorityStep, /exact performed split receipt/);
});

test('raw recovery receipts remain ephemeral and only the trusted split CLI mutates provider state', () => {
  assert.match(
    recoveryWorkflow,
    /node scripts\/reconcile-cloudflare-access-public-zone\.mjs >\/dev\/null 2>&1/,
  );
  assert.match(
    recoveryWorkflow,
    /node scripts\/fcr-access-public-worker-split-cli\.mjs apply >\/dev\/null 2>&1/,
  );
  assert.match(
    recoveryWorkflow,
    /node scripts\/fcr-access-public-worker-split-cli\.mjs rollback >\/dev\/null 2>&1/,
  );
  assert.match(
    recoveryWorkflow,
    /node scripts\/verify-fcr-front-door-playwright\.mjs >\/dev\/null 2>&1/,
  );
  assert.doesNotMatch(recoveryWorkflow, /reconcile-cloudflare-access-public-zone\.mjs --(?:apply|rollback)/);
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
  assert.match(returnStep, /\.audience == "random-stranger"/);
  assert.match(returnStep, /\.requestedOrigin == "https:\/\/foundercontrolroom\.org"/);
  assert.match(returnStep, /\.publicOrigin == "https:\/\/www\.foundercontrolroom\.org"/);
  assert.match(returnStep, /def origin_or_null:/);
  assert.match(returnStep, /\.finalOrigin \| origin_or_null/);
  assert.match(returnStep, /def status_or_null:/);
  assert.match(returnStep, /\.navigationStatus \| status_or_null/);
  assert.match(returnStep, /\.controlRoomStatus \| status_or_null/);
  assert.match(returnStep, /\.founderSignInVisible \| type == "boolean"/);
  assert.match(returnStep, /\.founderShellVisible \| type == "boolean"/);
  assert.match(returnStep, /\.authMeStatus \| status_or_null/);
  assert.match(returnStep, /\.founderAuthorityContained \| type == "boolean"/);
  assert.match(returnStep, /\.apiVersionStatus \| status_or_null/);
  assert.match(returnStep, /\.apiVersionMatchesExpectedSha \| type == "boolean"/);
  assert.match(returnStep, /\.state == "unknown" or \.state == "proven" or \.state == "failed"/);
  assert.match(returnStep, /has\("error"\)/);
  assert.match(returnStep, /\.error \| type == "string" and length <= 2000/);
  assert.doesNotMatch(returnStep, /\| tostring/);
  assert.match(returnStep, /finalOriginIsFcr/);
  assert.match(returnStep, /accessInterceptDetected/);
  assert.match(returnStep, /founderAuthorityContained/);
  assert.match(returnStep, /errorPresent/);
});

test('destination diagnostics publish counts and coverage booleans without raw provider identifiers', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized recovery receipt to founder control issue([\s\S]*?)- name: Upload sanitized recovery evidence/,
  )?.[1] ?? '';

  assert.match(returnStep, /destinationProfile/);
  assert.match(returnStep, /total:/);
  assert.match(returnStep, /public:/);
  assert.match(returnStep, /allWorkers:/);
  assert.match(returnStep, /worker:/);
  assert.match(returnStep, /previewWorker:/);
  assert.match(returnStep, /other:/);
  assert.match(returnStep, /hasWholeSitePublic:/);
  assert.match(returnStep, /hasNarrowPublic:/);
  assert.match(returnStep, /hasAllWorkers:/);
  assert.match(returnStep, /foundercontrolroom\.org\/\*/);
  assert.match(returnStep, /\.matchingApplications/);
  assert.doesNotMatch(returnStep, /\n\s*matchingApplications\s*[,}]/);
  assert.doesNotMatch(returnStep, /\n\s*(?:uri|hostname|name|id)\s*[,}]/);
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
  assert.match(returnStep, /destinationShape/);
  assert.match(returnStep, /destinationProfile/);
  assert.match(returnStep, /"single-subpath"/);
  assert.match(returnStep, /"multi-destination"/);
  assert.match(returnStep, /credentialFailures/);
  assert.match(returnStep, /rollbackPerformed/);
  assert.match(returnStep, /apiVersionMatchesExpectedSha/);
  assert.match(returnStep, /Access provider receipt: `malformed`/);
  assert.match(returnStep, /Browser proof receipt: `malformed`/);
  assert.match(returnStep, /Provider truth: `UNKNOWN`/);
  assert.match(returnStep, /Browser proof: `UNKNOWN`/);
  assert.match(returnStep, /\.matchingApplications/);
  assert.doesNotMatch(returnStep, /\n\s*matchingApplications\s*[,}]/);
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
  assert.doesNotMatch(artifactStep, /fcr-access-public-worker-split/);
});

test('provider mutation is limited to the exact public/Worker split kernel', () => {
  assert.match(splitKernel, /destinations\.length === 2/);
  assert.match(splitKernel, /wholeSitePublic\.length === 1/);
  assert.match(splitKernel, /workerDestinations\.length === 1/);
  assert.match(splitKernel, /otherDestinations\.length === 0/);
  assert.match(splitKernel, /'PUT'/);
  assert.match(splitKernel, /'POST'/);
  assert.match(splitKernel, /'DELETE'/);
  assert.match(splitKernel, /`\$\{target\}\/\*`/);
  assert.match(splitKernel, /`www\.\$\{target\}\/\*`/);
  assert.match(splitKernel, /`api\.\$\{target\}\/version`/);
  assert.match(splitKernel, /decision: 'bypass'/);
  assert.match(splitKernel, /include: \[\{ everyone: \{\} \}\]/);
  assert.match(splitKernel, /split-source-update-reconcile-required/);
  assert.match(splitKernel, /rollbackFcrPublicWorkerSplit/);
  assert.doesNotMatch(splitKernel, /deny_unmatched_requests_exempted_zone_names/);
  assert.doesNotMatch(splitKernel, /\/dns_records|\/routes|wrangler|supabase/i);

  assert.match(splitCli, /fcr-access-split-v1:/);
  assert.match(splitCli, /split-rollback-receipt-head-mismatch/);
  assert.match(splitCli, /FRONT_DOOR_COMPAT_RECEIPT_PATH/);
  assert.doesNotMatch(splitCli, /APPROVAL_REFERENCE/);

  // The predecessor remains the read-only topology observer in the trusted lane.
  assert.match(reconciliation, /existing-public-access-app-requires-review/);
});

test('browser proof binds public origin, private Worker containment, and runtime to the exact approved SHA', () => {
  assert.match(browserProof, /https:\/\/www\.foundercontrolroom\.org/);
  assert.match(browserProof, /https:\/\/api\.foundercontrolroom\.org\/version/);
  assert.match(browserProof, /https:\/\/api\.foundercontrolroom\.org\/health/);
  assert.match(browserProof, /PUBLIC_HEALTH_URL/);
  assert.match(browserProof, /EXPECTED_API_SERVICE = 'founder-control-room'/);
  assert.match(browserProof, /publicHealthReachesCanonicalWorker/);
  assert.match(browserProof, /protectedApiHealthDeniedToStranger/);
  assert.match(browserProof, /maxRedirects:\s*0/);
  assert.match(browserProof, /receipt\.finalOrigin !== PUBLIC_ORIGIN/);
  assert.match(browserProof, /Always probe the canonical public origin independently/);
  assert.match(browserProof, /versionPayload\.includes\(expectedHeadSha\)/);
  assert.match(browserProof, /chromium\.launch/);
});