import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FCR_ACCESS_ACCOUNT_ID,
  verifyFcrCloudflareAccessBoundary,
} from './verify-fcr-cloudflare-access-boundary.mjs';

const API_TOKEN = 'cf-api-read-token';
const CLIENT_ID = 'fcr-client.access';
const TOKEN_ID = 'fcr-service-token-1';
const NOW = Date.parse('2026-10-15T06:00:00Z');

const boundary = {
  publicHosts: ['foundercontrolroom.org', 'www.foundercontrolroom.org'],
  accessRequiredHosts: ['app.foundercontrolroom.org', 'api.foundercontrolroom.org'],
  apiDefault: 'access_required',
  applicationAuthenticatedBypassPaths: ['/mcp', '/mcp/read', '/mcp/founder-signal-x-engagement'],
};

function response(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return status >= 200 && status < 300
        ? { success: true, result }
        : { success: false, errors: [{ code: 10000 }] };
    },
  };
}

function readyState() {
  return {
    apps: [
      {
        id: 'app-browser',
        destinations: [{ type: 'public', uri: 'app.foundercontrolroom.org/*' }],
      },
      {
        id: 'api-worker',
        destinations: [{ type: 'worker', uri: 'founder-control-room' }],
      },
      {
        id: 'api-exceptions',
        destinations: boundary.applicationAuthenticatedBypassPaths.map((path) => ({
          type: 'public',
          uri: `api.foundercontrolroom.org${path}`,
        })),
      },
    ],
    policies: {
      'app-browser': [{ id: 'allow-founder', decision: 'allow', include: [{ email: { email: 'founder@example.com' } }] }],
      'api-worker': [{ id: 'service-auth', decision: 'non_identity', include: [{ service_token: { token_id: TOKEN_ID } }] }],
      'api-exceptions': [{ id: 'bypass-exact', decision: 'bypass', include: [{ everyone: {} }] }],
    },
    serviceTokens: [{ id: TOKEN_ID, client_id: CLIENT_ID, enabled: true, expires_at: '2027-01-01T00:00:00Z' }],
  };
}

function provider(state) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/access/apps')) return response(state.apps);
    if (parsed.pathname.endsWith('/access/service_tokens')) return response(state.serviceTokens);
    const policy = parsed.pathname.match(/\/access\/apps\/([^/]+)\/policies$/);
    if (policy) return response(state.policies[decodeURIComponent(policy[1])] ?? []);
    throw new Error(`Unexpected provider request: ${url}`);
  };
  return { fetchImpl, calls };
}

const env = {
  CLOUDFLARE_ACCOUNT_ID: FCR_ACCESS_ACCOUNT_ID,
  CLOUDFLARE_ACCESS_API_TOKEN: API_TOKEN,
  FCR_CLOUDFLARE_ACCESS_CLIENT_ID: CLIENT_ID,
  EXPECTED_HEAD_SHA: 'a'.repeat(40),
};

test('verifies public doorway, app identity policy, API service auth, and exact exception coverage', async () => {
  const state = readyState();
  const { fetchImpl, calls } = provider(state);
  const receipt = await verifyFcrCloudflareAccessBoundary({ fetchImpl, env, nowMs: NOW, boundary });
  assert.equal(receipt.state, 'ready');
  assert.equal(receipt.publicDoorwayClear, true);
  assert.equal(receipt.appHostProtected, true);
  assert.equal(receipt.apiWorkerProtected, true);
  assert.equal(receipt.apiServiceAuthVerified, true);
  assert.equal(receipt.expectedExceptionCount, boundary.applicationAuthenticatedBypassPaths.length);
  assert.equal(receipt.verifiedExceptionCount, boundary.applicationAuthenticatedBypassPaths.length);
  assert.equal(receipt.unexpectedApiBypassCount, 0);
  assert.match(receipt.serviceTokenIdFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(receipt).includes(CLIENT_ID), false);
  assert.equal(JSON.stringify(receipt).includes(TOKEN_ID), false);
  assert.ok(calls.every((call) => call.init.headers.Authorization === `Bearer ${API_TOKEN}`));
});

test('fails when Access still owns the public doorway', async () => {
  const state = readyState();
  state.apps.push({ id: 'bad-apex', destinations: [{ type: 'public', uri: 'foundercontrolroom.org/*' }] });
  const { fetchImpl } = provider(state);
  await assert.rejects(
    verifyFcrCloudflareAccessBoundary({ fetchImpl, env, nowMs: NOW, boundary }),
    (error) => error?.classification === 'public-doorway-access-present',
  );
});

test('fails when app host is missing, bypassed, or ambiguous', async () => {
  const missing = readyState();
  missing.apps = missing.apps.filter((app) => app.id !== 'app-browser');
  await assert.rejects(
    verifyFcrCloudflareAccessBoundary({ fetchImpl: provider(missing).fetchImpl, env, nowMs: NOW, boundary }),
    (error) => error?.classification === 'app-access-application-missing-or-ambiguous',
  );

  const bypassed = readyState();
  bypassed.policies['app-browser'] = [{ decision: 'bypass', include: [{ everyone: {} }] }];
  await assert.rejects(
    verifyFcrCloudflareAccessBoundary({ fetchImpl: provider(bypassed).fetchImpl, env, nowMs: NOW, boundary }),
    (error) => error?.classification === 'app-access-policy-invalid',
  );
});

test('fails when API Worker service-auth binding is missing or token is invalid', async () => {
  const missing = readyState();
  missing.policies['api-worker'] = [];
  await assert.rejects(
    verifyFcrCloudflareAccessBoundary({ fetchImpl: provider(missing).fetchImpl, env, nowMs: NOW, boundary }),
    (error) => error?.classification === 'api-service-auth-policy-missing',
  );

  const expired = readyState();
  expired.serviceTokens[0].expires_at = '2026-10-14T00:00:00Z';
  await assert.rejects(
    verifyFcrCloudflareAccessBoundary({ fetchImpl: provider(expired).fetchImpl, env, nowMs: NOW, boundary }),
    (error) => error?.classification === 'service-token-invalid-or-ambiguous',
  );
});

test('fails on undeclared broad API bypass and on missing exact exception', async () => {
  const broad = readyState();
  broad.apps.push({ id: 'bad-api-wide', destinations: [{ type: 'public', uri: 'api.foundercontrolroom.org/*' }] });
  broad.policies['bad-api-wide'] = [{ decision: 'bypass', include: [{ everyone: {} }] }];
  await assert.rejects(
    verifyFcrCloudflareAccessBoundary({ fetchImpl: provider(broad).fetchImpl, env, nowMs: NOW, boundary }),
    (error) => error?.classification === 'unexpected-api-bypass-destination',
  );

  const missing = readyState();
  missing.apps.find((app) => app.id === 'api-exceptions').destinations.pop();
  await assert.rejects(
    verifyFcrCloudflareAccessBoundary({ fetchImpl: provider(missing).fetchImpl, env, nowMs: NOW, boundary }),
    (error) => error?.classification === 'api-exception-coverage-missing-or-ambiguous',
  );
});

test('fails closed before provider mutation because this verifier is read-only', async () => {
  const state = readyState();
  const { fetchImpl, calls } = provider(state);
  await verifyFcrCloudflareAccessBoundary({ fetchImpl, env, nowMs: NOW, boundary });
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => !call.init.method || call.init.method === 'GET'));
});
