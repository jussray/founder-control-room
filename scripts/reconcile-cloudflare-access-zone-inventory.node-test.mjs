import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
  verifyZoneScopedAccessInventory,
} from './reconcile-cloudflare-access-public-zone.mjs';

const READ_TOKEN = 'cf-read-token-123';
const ADMIN_TOKEN = 'cf-admin-token-456';
const ZONE_ID = '023e105f4ecef8ad9ca31a8372d0c353';

function response(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return status >= 200 && status < 300
        ? { success: true, result }
        : { success: false, errors: [{ code: 10000, message: 'forbidden' }] };
    },
  };
}

function exactZone() {
  return {
    id: ZONE_ID,
    name: FCR_PUBLIC_ZONE,
    status: 'active',
    account: { id: FCR_CLOUDFLARE_ACCOUNT_ID },
  };
}

function env(tokenName, token) {
  return {
    [tokenName]: token,
    CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
  };
}

test('zone preflight proves exact active zone and empty zone-scoped Access coverage', async () => {
  const requests = [];
  const receipt = await verifyZoneScopedAccessInventory({
    env: env('CLOUDFLARE_ACCESS_API_TOKEN', READ_TOKEN),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, authorization: options.headers?.Authorization });
      if (url.includes('/zones?')) return response([exactZone()]);
      if (url.includes(`/zones/${ZONE_ID}/access/apps?`)) return response([]);
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(receipt.state, 'clear');
  assert.equal(receipt.matchingApplicationCount, 0);
  assert.equal(requests.length, 2);
  assert.ok(requests[0].url.includes(`name=${encodeURIComponent(FCR_PUBLIC_ZONE)}`));
  assert.ok(requests[0].url.includes(`account.id=${FCR_CLOUDFLARE_ACCOUNT_ID}`));
  assert.ok(requests.every((request) => request.authorization === `Bearer ${READ_TOKEN}`));
});

test('zone-scoped public destination blocks account-scoped recovery', async () => {
  await assert.rejects(
    verifyZoneScopedAccessInventory({
      env: env('CLOUDFLARE_ACCESS_API_TOKEN', READ_TOKEN),
      fetchImpl: async (url) => {
        if (url.includes('/zones?')) return response([exactZone()]);
        if (url.includes(`/zones/${ZONE_ID}/access/apps?`)) {
          return response([{
            id: 'zone-app-1',
            name: 'existing-zone-owner',
            destinations: [{ type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` }],
          }]);
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    }),
    (error) => (
      error?.classification === 'existing-public-access-app-requires-review'
      && error?.matchingApplications?.length === 1
    ),
  );
});

test('zone discovery failure is provider-read-failed and cannot become apply authority', async () => {
  await assert.rejects(
    verifyZoneScopedAccessInventory({
      env: env('CLOUDFLARE_ACCESS_API_TOKEN', READ_TOKEN),
      fetchImpl: async () => response(null, 403),
    }),
    (error) => (
      error?.classification === 'provider-read-failed'
      && error?.credentialFailures?.[0]?.reason === 'provider-read-failed'
      && error?.credentialFailures?.[0]?.status === 403
    ),
  );
});

test('apply preflight uses only dedicated admin authority', async () => {
  const authorizations = [];
  const receipt = await verifyZoneScopedAccessInventory({
    env: env('CLOUDFLARE_ACCESS_ADMIN_API_TOKEN', ADMIN_TOKEN),
    apply: true,
    fetchImpl: async (url, options = {}) => {
      authorizations.push(options.headers?.Authorization);
      if (url.includes('/zones?')) return response([exactZone()]);
      if (url.includes(`/zones/${ZONE_ID}/access/apps?`)) return response([]);
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(receipt.state, 'clear');
  assert.ok(authorizations.every((value) => value === `Bearer ${ADMIN_TOKEN}`));
});

test('missing dedicated read credential defers to canonical core failure receipt without provider request', async () => {
  let requests = 0;
  const receipt = await verifyZoneScopedAccessInventory({
    env: { CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID },
    fetchImpl: async () => {
      requests += 1;
      throw new Error('must not fetch');
    },
  });

  assert.equal(receipt.state, 'defer-to-core');
  assert.equal(requests, 0);
});
