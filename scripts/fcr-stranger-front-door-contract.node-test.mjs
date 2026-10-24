import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/fcr-access-front-door-recovery.yml', 'utf8');
const browserProof = readFileSync('scripts/verify-fcr-front-door-playwright.mjs', 'utf8');
const authRoute = readFileSync('src/http/routes/auth.ts', 'utf8');
const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const pagesReleaseWorkflow = readFileSync('.github/workflows/pages-production-release.yml', 'utf8');
const workerReconcileWorkflow = readFileSync('.github/workflows/worker-reconcile.yml', 'utf8');
const productionPlaywrightWorkflow = readFileSync('.github/workflows/playwright.yml', 'utf8');
const reviewProbeWorkflow = readFileSync('.github/workflows/founder-signal-engine-review-probe.yml', 'utf8');
const productionWitness = readFileSync('e2e/production-release-sha.spec.ts', 'utf8');
const promptRuntimeWorkflow = readFileSync('.github/workflows/prompt-workflow-router-runtime-proof.yml', 'utf8');
const promptRuntimeSpec = readFileSync('e2e/builder-prompt-workflow-runtime.spec.ts', 'utf8');
const operatorRelaySpec = readFileSync('e2e/operator-relay-live.spec.ts', 'utf8');
const accessPolicy = JSON.parse(readFileSync('config/fcr-cloudflare-access-boundary.json', 'utf8'));

test('stranger proof tests reachability and founder containment rather than public membership', () => {
  assert.match(browserProof, /audience:\s*'random-stranger'/);
  assert.match(browserProof, /https:\/\/foundercontrolroom\.org/);
  assert.match(browserProof, /https:\/\/www\.foundercontrolroom\.org/);
  assert.match(browserProof, /DIRECT_APP_URL\s*=\s*'https:\/\/app\.foundercontrolroom\.org\/'/);
  assert.match(browserProof, /DIRECT_API_VERSION_URL\s*=\s*'https:\/\/api\.foundercontrolroom\.org\/version'/);
  assert.match(browserProof, /SAME_ORIGIN_VERSION_URL\s*=\s*`\$\{APEX_ORIGIN\}\/version`/);
  assert.match(browserProof, /maxRedirects:\s*0/);
  assert.match(browserProof, /directAppAccessProtected/);
  assert.match(browserProof, /directApiAccessProtected/);
  assert.match(browserProof, /apiVersionServiceIdentity/);
  assert.match(browserProof, /CONTROL_ROOM_URL/);
  assert.match(browserProof, /\.sign-in-wrap/);
  assert.match(browserProof, /\.shell/);
  assert.match(browserProof, /AUTH_ME_URL/);
  assert.match(browserProof, /receipt\.authMeStatus !== 401/);
  assert.match(browserProof, /founderAuthorityContained/);
  assert.match(browserProof, /chromium\.launch/);
  assert.doesNotMatch(browserProof, /signup/i);
});

test('direct API protection requires Access-specific evidence rather than a generic denial', () => {
  assert.match(browserProof, /cloudflareaccess\\\.com\|\\\/cdn-cgi\\\/access\\\//);
  assert.doesNotMatch(browserProof, /status === 401 \|\| status === 403/);
  assert.doesNotMatch(browserProof, /access\\s\+denied/i);
});

test('direct production API callers use the dedicated FCR Access service token', () => {
  const workflowSurfaces = [
    deployWorkflow,
    pagesReleaseWorkflow,
    workerReconcileWorkflow,
    productionPlaywrightWorkflow,
    reviewProbeWorkflow,
  ];
  for (const source of workflowSurfaces) {
    assert.match(source, /FCR_CLOUDFLARE_ACCESS_CLIENT_ID/);
    assert.match(source, /FCR_CLOUDFLARE_ACCESS_CLIENT_SECRET/);
  }
  for (const source of [deployWorkflow, pagesReleaseWorkflow, workerReconcileWorkflow, reviewProbeWorkflow]) {
    assert.match(source, /CF-Access-Client-Id/);
    assert.match(source, /CF-Access-Client-Secret/);
  }
  assert.match(productionWitness, /CF-Access-Client-Id/);
  assert.match(productionWitness, /CF-Access-Client-Secret/);
});

test('proof-of-ship exact-SHA readback remains Access-authenticated', () => {
  const proofBlock = deployWorkflow.match(
    /proof-of-ship:[\s\S]*?- name: Verify the live Worker still reports the deployed SHA([\s\S]*?)- name: Retain verified proof for founder review/,
  )?.[1] ?? '';
  assert.match(proofBlock, /FCR_ACCESS_CLIENT_ID/);
  assert.match(proofBlock, /FCR_ACCESS_CLIENT_SECRET/);
  assert.match(proofBlock, /CF-Access-Client-Id/);
  assert.match(proofBlock, /CF-Access-Client-Secret/);
});

test('deployed prompt/operator runtime proof adds Access only to the direct API origin', () => {
  assert.match(promptRuntimeWorkflow, /environment:\s*production/);
  assert.match(promptRuntimeWorkflow, /FCR_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.match(promptRuntimeWorkflow, /FCR_CLOUDFLARE_ACCESS_CLIENT_SECRET/);
  assert.match(promptRuntimeSpec, /hostname === 'api\.foundercontrolroom\.org'/);
  assert.match(promptRuntimeSpec, /CF-Access-Client-Id/);
  assert.match(promptRuntimeSpec, /CF-Access-Client-Secret/);
  assert.match(operatorRelaySpec, /hostname === 'api\.foundercontrolroom\.org'/);
  assert.match(operatorRelaySpec, /CF-Access-Client-Id/);
  assert.match(operatorRelaySpec, /CF-Access-Client-Secret/);
  assert.ok(accessPolicy.serviceTokenProtectedPaths.includes('/prompt-workflows/execution-spine'));
  assert.ok(accessPolicy.serviceTokenProtectedPaths.includes('/prompt-workflows/select'));
});

test('API exception policy is exact and excludes write-capable MCP from bypass', () => {
  assert.deepEqual(accessPolicy.accessRequiredHosts, [
    'app.foundercontrolroom.org',
    'api.foundercontrolroom.org',
  ]);
  assert.equal(accessPolicy.apiDefault, 'access_required');
  // MCP protocol paths are reachable only through the public Pages service binding;
  // they must not become direct API Cloudflare Access bypass destinations.
  for (const protocolPath of [
    '/mcp',
    '/mcp/read',
    '/mcp/founder-signal-x-engagement',
    '/mcp/registry/v0.1/servers',
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
  ]) {
    assert.ok(accessPolicy.publicServiceBindingProtocolPaths.includes(protocolPath));
    assert.ok(!accessPolicy.applicationAuthenticatedBypassPaths.includes(protocolPath));
  }
  assert.ok(
    accessPolicy.applicationAuthenticatedBypassPaths.every(
      (path) => !path.startsWith('/mcp') && !path.startsWith('/.well-known/oauth-protected-resource'),
    ),
  );
  assert.ok(accessPolicy.applicationAuthenticatedBypassPaths.includes('/ingest/jira-work-automation'));
  assert.ok(accessPolicy.applicationAuthenticatedBypassPaths.includes('/ingest/bip-control-room-proof'));
  assert.ok(!accessPolicy.applicationAuthenticatedBypassPaths.includes('/mcp/*'));
  assert.ok(accessPolicy.serviceTokenProtectedPaths.includes('/mcp/founder-signal-engine'));
  assert.ok(!accessPolicy.serviceTokenProtectedPaths.includes('/mcp/founder-signal-x-engagement'));
});

test('founder auth contract remains allowlist-first and founder-gated', () => {
  const magicLinkBlock = authRoute.match(
    /authRouter\.post\('\/magic-link'([\s\S]*?)authRouter\.get\('\/callback'/,
  )?.[1] ?? '';
  assert.match(magicLinkBlock, /if \(await isAllowlisted\(email\)\)/);
  assert.match(magicLinkBlock, /signInWithOtp/);
  assert.ok(
    magicLinkBlock.indexOf('if (await isAllowlisted(email))')
      < magicLinkBlock.indexOf('signInWithOtp'),
    'allowlist check must precede Supabase magic-link creation',
  );
  assert.match(authRoute, /authRouter\.get\('\/me', requireFounder/);
  assert.match(authRoute, /if \(!\(await isAllowlisted\(email\)\)\) return respondError\(res, 403, 'FORBIDDEN'/);
  assert.doesNotMatch(authRoute, /authRouter\.(?:post|get)\('\/signup'/);
});

test('provider recovery requires complete app/API boundary readback before browser proof can count', () => {
  assert.match(workflow, /verify-fcr-cloudflare-access-boundary\.mjs/);
  assert.match(workflow, /FCR_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.match(workflow, /FCR_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID/);
  assert.match(workflow, /ACCESS_BOUNDARY_READ_OUTCOME/);
  assert.match(workflow, /ACCESS_BOUNDARY_APPLY_OUTCOME/);
  assert.match(workflow, /test "\$boundary_outcome" = 'success'/);
  assert.match(workflow, /fcr-cloudflare-access-boundary-provider/);
});

test('provider and stranger witnesses are independent and aggregate fail closed', () => {
  const inspectBlock = workflow.match(
    /- name: Inspect live browser Access ownership without mutation([\s\S]*?)- name: Detach browser-facing FCR destinations with dedicated admin authority/,
  )?.[1] ?? '';
  const browserBlock = workflow.match(
    /- name: Verify FCR-owned sign-in and no Cloudflare Access screen([\s\S]*?)- name: Evaluate provider detachment and stranger evidence/,
  )?.[1] ?? '';
  const gateBlock = workflow.match(
    /- name: Evaluate provider detachment and stranger evidence([\s\S]*?)- name: Return sanitized recovery receipt/,
  )?.[1] ?? '';

  assert.match(inspectBlock, /id:\s*access_inspect/);
  assert.match(inspectBlock, /continue-on-error:\s*true/);
  assert.match(browserBlock, /id:\s*stranger_browser/);
  assert.match(browserBlock, /if: always\(\) && steps\.contracts\.outcome == 'success' && steps\.chromium\.outcome == 'success'/);
  assert.doesNotMatch(browserBlock, /access_inspect|access_apply/);
  assert.match(gateBlock, /provider_outcome/);
  assert.match(gateBlock, /STRANGER_BROWSER_OUTCOME/);
  assert.match(gateBlock, /test "\$provider_outcome" = 'success'/);
  assert.match(gateBlock, /test "\$STRANGER_BROWSER_OUTCOME" = 'success'/);
  assert.match(workflow, /Fail closed after retaining provider and stranger evidence/);
});

test('sanitized stranger receipt publishes only bounded containment evidence', () => {
  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.scope == "fcr-access-front-door-browser-proof"/);
  assert.match(workflow, /\.audience == "random-stranger"/);
  assert.match(workflow, /\.founderSignInVisible \| type == "boolean"/);
  assert.match(workflow, /\.founderShellVisible \| type == "boolean"/);
  assert.match(workflow, /\.authMeStatus \| status_or_null/);
  assert.match(workflow, /\.founderAuthorityContained \| type == "boolean"/);
  assert.match(workflow, /\.directAppStatus \| status_or_null/);
  assert.match(workflow, /\.directAppAccessProtected \| type == "boolean"/);
  assert.match(workflow, /\.directApiVersionStatus \| status_or_null/);
  assert.match(workflow, /\.directApiAccessProtected \| type == "boolean"/);
  assert.match(workflow, /\.apiVersionServiceIdentity/);
  assert.match(workflow, /Browser proof receipt/);
  assert.doesNotMatch(workflow, /\n\s*error,\s*\n/);
  assert.doesNotMatch(workflow, /cat "\$browser_receipt"/);
});
