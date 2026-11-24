import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync('security/firewall-v10.policy.json', 'utf8'));
const server = readFileSync('src/http/server.ts', 'utf8');
const productBuild = readFileSync('src/http/routes/productBuild.ts', 'utf8');

function assertOrder(source, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    assert.notEqual(next, -1, `missing token: ${token}`);
    assert.ok(next > cursor, `out-of-order token: ${token}`);
    cursor = next;
  }
}

const directiveStart = productBuild.indexOf("'/storyengine/directive'");
const executeStart = productBuild.indexOf("'/storyengine/execute'");
assert.notEqual(directiveStart, -1);
assert.notEqual(executeStart, -1);
const directiveRoute = productBuild.slice(directiveStart, executeStart);
const executeRoute = productBuild.slice(executeStart);

const csrfIndex = server.indexOf('app.use(requireSameOriginBrowserMutation);');
const productBuildMountIndex = server.indexOf("app.use('/l99/product-build', productBuildRouter);");
const receiptIngressIndex = server.indexOf("'/ingest/product-build-receipts/storyengine'");

test('FW01 policy binds the exact product-build mutation and receipt paths', () => {
  assert.deepEqual(policy.bindings.productBuild, {
    mountPath: '/l99/product-build',
    directivePath: '/storyengine/directive',
    executePath: '/storyengine/execute',
    fullDirectivePath: '/l99/product-build/storyengine/directive',
    fullExecutePath: '/l99/product-build/storyengine/execute',
    receiptIngressPath: '/ingest/product-build-receipts/storyengine',
    founderAuthMiddleware: 'requireFounder',
    founderMasterSwitch: 'fcr-privileged-execution-master',
    applicationRateLimitMiddleware: 'rateLimitFounderPermissions',
    sameOriginBrowserMutationGateBeforeMount: true,
    receiptIngressIsServerToServer: true,
    receiptIngressRateLimitMiddleware: 'rateLimitGeneral',
    blindRetryAllowed: false,
    mergeAuthorized: false,
    deployAuthorized: false,
    providerMutationAuthorized: false,
  });
});

test('FW02 browser mutation firewall remains before the product-build mount', () => {
  assert.ok(csrfIndex >= 0);
  assert.ok(productBuildMountIndex > csrfIndex);
});

test('FW03 directive route preserves rate-limit -> founder -> master-switch order', () => {
  assertOrder(directiveRoute, [
    'rateLimitFounderPermissions',
    'requireFounder',
    "requirePortfolioSwitchOn('fcr-privileged-execution-master')",
  ]);
});

test('FW04 execute route preserves rate-limit -> founder -> master-switch order', () => {
  assertOrder(executeRoute, [
    'rateLimitFounderPermissions',
    'requireFounder',
    "requirePortfolioSwitchOn('fcr-privileged-execution-master')",
  ]);
});

test('FW05 StoryEngine directive keeps node-test + playwright proof requirements', () => {
  assert.match(productBuild, /requiredProof:\s*\['node-test',\s*'playwright'\]/);
});

test('FW06 issuance and execution remain bounded and never grant merge/deploy/provider authority', () => {
  assert.match(directiveRoute, /issuedAuthority\(false\)/);
  assert.match(executeRoute, /issuedAuthority\(true\)/);
  assert.match(productBuild, /mergeAuthorized:\s*false/);
  assert.match(productBuild, /deployAuthorized:\s*false/);
  assert.match(productBuild, /providerMutationAuthorized:\s*false/);
});

test('FW07 federation failures forbid blind retry and do not counterfeit execution certainty', () => {
  assert.match(executeRoute, /blindRetryAllowed:\s*false/);
  assert.match(executeRoute, /executionState:\s*error\.mayHaveExecuted\s*\?\s*'unknown'\s*:\s*'not_verified'/);
  assert.match(executeRoute, /executionState:\s*'unknown'/);
});

test('FW08 StoryEngine receipt ingress stays server-to-server, rate-limited, and outside browser CSRF', () => {
  assert.ok(receiptIngressIndex >= 0);
  assert.ok(receiptIngressIndex < csrfIndex);
  const ingressWindow = server.slice(receiptIngressIndex, receiptIngressIndex + 260);
  assert.match(ingressWindow, /rateLimitGeneral/);
  assert.match(ingressWindow, /handleProductBuildReceiptIngest/);
});

test('FW09 product-build API key remains server-only policy material', () => {
  assert.ok(policy.controls.auth.criticalServerOnlySecrets.includes('STORYENGINE_PRODUCT_CONTROL_ROOM_API_KEY'));
});

test('FW10 source policy cannot masquerade as an activated production firewall', () => {
  assert.equal(policy.activationStage, 'policy-ci-only');
  assert.equal(policy.evidence.productionCloudflareApplied, 'unknown');
  assert.equal(policy.evidence.productionBlockModeAuthorized, false);
  for (const route of policy.controls.rateLimiting.edgeRoutes) {
    assert.equal(route.enforcement, 'observe-before-block');
  }
});
