import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { chdir, cwd } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
  appHasBrowserFacingFcrDestination,
  browserFacingDestinationCount,
  isBrowserFacingFcrPublicDestination,
  matchingAccessReasons,
  reconcileFcrPublicAccessZone,
  rollbackFcrPublicAccessZone,
} from './reconcile-cloudflare-access-public-zone.mjs';

const READ_TOKEN = 'cf-read-token-123';
const ADMIN_TOKEN = 'cf-admin-token-456';

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

function mixedApp() {
  return {
    id: 'mixed-1',
    name: 'FCR mixed access',
    type: 'self_hosted',
    domain: FCR_PUBLIC_ZONE,
    destinations: [
      { type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` },
      { type: 'worker', uri: 'founder-control-room' },
    ],
  };
}

function workerOnlyApp() {
  return {
    id: 'worker-1',
    name: 'FCR worker access',
    type: 'self_hosted',
    domain: FCR_PUBLIC_ZONE,
    destinations: [{ type: 'worker', uri: 'founder-control-room' }],
  };
}

function fakeFetch({ applications = [], policiesByApp = {}, onRequest } = {}) {
  const state = {
    applications: applications.map((item) => structuredClone(item)),
    policiesByApp: structuredClone(policiesByApp),
  };

  return async (url, options = {}) => {
    const method = options.method ?? 'GET';
    onRequest?.({ url, method, authorization: options.headers?.Authorization ?? null, body: options.body ?? null });

    if (url.includes('/access/apps?') && method === 'GET') {
      return response(state.applications);
    }

    const appGetMatch = url.match(/\/access\/apps\/([^/?]+)$/);
    if (appGetMatch && method === 'GET') {
      const appId = decodeURIComponent(appGetMatch[1]);
      return response(state.applications.find((item) => item.id === appId) ?? null);
    }

    const policyMatch = url.match(/\/access\/apps\/([^/]+)\/policies\?/);
    if (policyMatch && method === 'GET') {
      const appId = decodeURIComponent(policyMatch[1]);
      return response(state.policiesByApp[appId] ?? []);
    }

    const putMatch = url.match(/\/access\/apps\/([^/?]+)$/);
    if (putMatch && method === 'PUT') {
      const appId = decodeURIComponent(putMatch[1]);
      const body = JSON.parse(options.body);
      const index = state.applications.findIndex((item) => item.id === appId);
      if (index < 0) return response(null, 404);
      state.applications[index] = { ...state.applications[index], ...body };
      return response(state.applications[index]);
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  };
}

const readEnv = {
  CLOUDFLARE_ACCESS_API_TOKEN: READ_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
};

const adminEnv = {
  CLOUDFLARE_ACCESS_ADMIN_API_TOKEN: ADMIN_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
};

test('browser-facing Access means apex or www public destinations, not private Worker destinations', () => {
  assert.equal(isBrowserFacingFcrPublicDestination({ type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` }), true);
  assert.equal(isBrowserFacingFcrPublicDestination({ type: 'public', uri: `www.${FCR_PUBLIC_ZONE}/control-room/*` }), true);
  assert.equal(isBrowserFacingFcrPublicDestination({ type: 'public', uri: `api.${FCR_PUBLIC_ZONE}/version` }), false);
  assert.equal(isBrowserFacingFcrPublicDestination({ type: 'worker', uri: 'founder-control-room' }), false);
  assert.equal(appHasBrowserFacingFcrDestination(mixedApp()), true);
  assert.equal(browserFacingDestinationCount(mixedApp()), 1);
  assert.deepEqual(matchingAccessReasons(mixedApp()), ['browser-public-destination', 'worker']);
});

test('inspect reports clear when Access does not own the FCR browser doorway', async () => {
  const receipt = await reconcileFcrPublicAccessZone({
    env: readEnv,
    fetchImpl: fakeFetch({ applications: [workerOnlyApp()] }),
  });
  assert.equal(receipt.state, 'clear');
  assert.equal(receipt.action, 'browser-access-already-detached');
  assert.equal(receipt.browserAccessDestinationCount, 0);
  assert.equal(receipt.mutationPerformed, false);
});

test('inspect plans detachment while preserving non-browser destinations', async () => {
  const receipt = await reconcileFcrPublicAccessZone({
    env: readEnv,
    fetchImpl: fakeFetch({ applications: [mixedApp()] }),
  });
  assert.equal(receipt.state, 'attention');
  assert.equal(receipt.action, 'would-detach-browser-access');
  assert.equal(receipt.browserAccessDestinationCount, 1);
  assert.equal(receipt.preservedNonBrowserDestinationCount, 1);
  assert.equal(receipt.mutationPerformed, false);
});

test('inspect never falls back to admin authority', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: adminEnv,
      apply: false,
      fetchImpl: fakeFetch(),
    }),
    /CLOUDFLARE_ACCESS_API_TOKEN is required for Access inspection/,
  );
});

test('apply removes only browser-facing public destinations and preserves Worker access plus policies', async () => {
  const requests = [];
  const receipt = await reconcileFcrPublicAccessZone({
    env: adminEnv,
    apply: true,
    fetchImpl: fakeFetch({
      applications: [mixedApp()],
      policiesByApp: {
        'mixed-1': [{ id: 'policy-1', decision: 'allow', include: [{ email: { email: 'founder@example.com' } }] }],
      },
      onRequest(request) { requests.push(request); },
    }),
  });

  assert.equal(receipt.state, 'mutated-needs-browser-proof');
  assert.equal(receipt.action, 'detached-browser-access');
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.browserAccessDestinationCount, 0);
  assert.equal(receipt.preservedNonBrowserDestinationCount, 1);
  assert.deepEqual(receipt.expectedPostDestinations, [{ type: 'worker', uri: 'founder-control-room' }]);
  const put = requests.find((request) => request.method === 'PUT');
  assert.ok(put);
  assert.deepEqual(JSON.parse(put.body).destinations, [{ type: 'worker', uri: 'founder-control-room' }]);
  assert.ok(requests.every((request) => request.authorization === `Bearer ${ADMIN_TOKEN}`));
});

test('automatic mutation blocks a public-only application instead of deleting unknown provider state', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: adminEnv,
      apply: true,
      fetchImpl: fakeFetch({
        applications: [{
          id: 'public-only',
          name: 'unknown owner',
          type: 'self_hosted',
          domain: FCR_PUBLIC_ZONE,
          destinations: [{ type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` }],
        }],
      }),
    }),
    (error) => error?.classification === 'public-only-access-app-requires-reviewed-deletion',
  );
});

test('multiple browser-owning Access apps fail closed', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: readEnv,
      fetchImpl: fakeFetch({
        applications: [
          mixedApp(),
          {
            id: 'second',
            name: 'second',
            type: 'self_hosted',
            domain: `www.${FCR_PUBLIC_ZONE}`,
            destinations: [{ type: 'public', uri: `www.${FCR_PUBLIC_ZONE}/*` }, { type: 'worker', uri: 'other-worker' }],
          },
        ],
      }),
    }),
    (error) => error?.classification === 'multiple-browser-access-apps-require-review',
  );
});

test('rollback restores only the exact receipt-bound pre-detachment destinations', async () => {
  const before = cwd();
  const temp = await mkdtemp(join(tmpdir(), 'fcr-access-detach-test-'));
  try {
    chdir(temp);
    await mkdir('test-results', { recursive: true });
    const policies = [{ id: 'policy-1', decision: 'allow', include: [{ email: { email: 'founder@example.com' } }] }];
    const source = mixedApp();
    const requests = [];
    const applied = await reconcileFcrPublicAccessZone({
      env: adminEnv,
      apply: true,
      fetchImpl: fakeFetch({
        applications: [source],
        policiesByApp: { 'mixed-1': policies },
        onRequest(request) { requests.push(request); },
      }),
    });
    await writeFile('test-results/fcr-access-front-door-recovery.json', `${JSON.stringify(applied)}\n`, 'utf8');

    const rollbackFetch = fakeFetch({
      applications: [{ ...source, destinations: applied.expectedPostDestinations }],
      policiesByApp: { 'mixed-1': policies },
    });
    const rolledBack = await rollbackFcrPublicAccessZone({ env: adminEnv, fetchImpl: rollbackFetch });
    assert.equal(rolledBack.rollbackPerformed, true);
    assert.equal(rolledBack.action, 'restored-browser-access-after-failed-provider-apply');
  } finally {
    chdir(before);
  }
});
