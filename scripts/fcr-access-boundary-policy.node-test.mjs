import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const policy = JSON.parse(readFileSync('config/fcr-cloudflare-access-boundary.json', 'utf8'));
const server = readFileSync('src/http/server.ts', 'utf8');
const reviewEmailWorker = readFileSync('src/worker/founderSignalReviewEmail.ts', 'utf8');
const workerEntry = readFileSync('src/worker/cf-entry.ts', 'utf8');
const bipIngress = readFileSync('src/worker/bipChiefEvidenceIngress.ts', 'utf8');

test('public discovery and Access-managed product hosts are explicit', () => {
  assert.deepEqual(policy.publicHosts, ['foundercontrolroom.org', 'www.foundercontrolroom.org']);
  assert.deepEqual(policy.accessRequiredHosts, ['app.foundercontrolroom.org', 'api.foundercontrolroom.org']);
  assert.equal(policy.apiDefault, 'access_required');
  assert.equal(policy.serviceTokenCredentials.clientId, 'FCR_CLOUDFLARE_ACCESS_CLIENT_ID');
  assert.equal(policy.serviceTokenCredentials.clientSecret, 'FCR_CLOUDFLARE_ACCESS_CLIENT_SECRET');
});

test('bypass policy is exact and never exempts the write-capable MCP surface', () => {
  const bypass = new Set(policy.applicationAuthenticatedBypassPaths);
  assert.ok(bypass.has('/mcp'));
  assert.ok(bypass.has('/mcp/read'));
  assert.ok(bypass.has('/ingest/jira-work-automation'));
  assert.ok(bypass.has('/ingest/bip-control-room-proof'));
  assert.ok(bypass.has('/ingest/product-build-receipts/storyengine'));
  assert.ok(bypass.has('/webhooks/github'));
  assert.ok(bypass.has('/webhooks/stripe-quickscan'));
  assert.ok(!bypass.has('/mcp/*'));
  assert.ok(!bypass.has('/*'));
  assert.ok(!bypass.has('/mcp/founder-signal-engine'));
  assert.ok(bypass.has('/mcp/founder-signal-x-engagement'));
  assert.ok(!policy.serviceTokenProtectedPaths.includes('/mcp/founder-signal-x-engagement'));
});

test('every declared public machine exception maps to a real server surface', () => {
  const requiredMarkers = [
    "'/webhooks/github'",
    "'/webhooks/stripe-quickscan'",
    "'/ingest/repository-verification'",
    "'/ingest/build-events/:slug'",
    "'/ingest/hair-commerce-receipts'",
    "'/ingest/proof-of-ship-receipts'",
    "'/ingest/founder-review-contexts'",
    "'/ingest/jira-work-automation'",
    "'/ingest/product-build-receipts/storyengine'",
    "'/api/federated-relay/v3'",
    "'/mcp'",
    "'/mcp/read'",
    "'/.well-known/oauth-protected-resource'",
    "'/.well-known/oauth-protected-resource/mcp'",
  ];
  for (const marker of requiredMarkers) assert.match(server, new RegExp(marker.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')));
});

test('Bip proof exception is bound to the Worker OIDC ingress rather than an unverified path string', () => {
  assert.match(bipIngress, /BIP_PROOF_INGRESS_PATH\s*=\s*'\/ingest\/bip-control-room-proof'/);
  assert.match(bipIngress, /verifyGitHubActionsOidc/);
  assert.match(workerEntry, /url\.pathname === BIP_PROOF_INGRESS_PATH/);
  assert.match(workerEntry, /handleBipControlRoomProofIngress/);
});

test('review-email ingress stays private to the Worker service binding', () => {
  assert.deepEqual(policy.serviceBindingOnlyPaths, ['/ingest/founder-review-email']);
  assert.match(reviewEmailWorker, /FOUNDER_CONTROL_ROOM_API/);
  assert.match(reviewEmailWorker, /apiBinding\.fetch\(/);
  assert.ok(!policy.applicationAuthenticatedBypassPaths.includes('/ingest/founder-review-email'));
});
