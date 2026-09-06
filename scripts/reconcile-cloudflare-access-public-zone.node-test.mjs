import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { chdir, cwd } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ACCESS_APP_NAME,
  FCR_PUBLIC_ZONE,
  appHasOnlyManagedPublicDestination,
  isEveryoneBypassPolicy,
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

function managedApp(id = 'managed-1') {
  return {
    id,
    name: FCR_PUBLIC_ACCESS_APP_NAME,
    type: 'self_hosted',
    domain: FCR_PUBLIC_ZONE,
    destinations: [{ type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` }],
  };
}

function bypassPolicy() {
  return {
    id: 'policy-1',
    decision: 'bypass',
    include: [{ everyone: {} }],
    require: [],
    exclude: [],
  };
}

function fakeFetch({
  applications = [],
  policiesByApp = {},
  onRequest,
  onCreate,
  onDelete,
} = {}) {
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

    const policyMatch = url.match(/\/access\/apps\/([^/]+)\/policies\?/);
    if (policyMatch && method === 'GET') {
      const appId = decodeURIComponent(policyMatch[1]);
      return response(state.policiesByApp[appId] ?? []);
    }

    if (url.endsWith('/access/apps') && method === 'POST') {
      const body = JSON.parse(options.body);
      const created = { id: 'created-1', ...body };
      state.applications.push(created);
      state.policiesByApp[created.id] = Array.isArray(body.policies) ? body.policies : [];
      onCreate?.(created);
      return response(created);
    }

    const deleteMatch = url.match(/\/access\/apps\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const appId = decodeURIComponent(deleteMatch[1]);
      state.applications = state.applications.filter((item) => item.id !== appId);
      delete state.policiesByApp[appId];
      onDelete?.(appId);
      return response({ id: appId });
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

test('all-workers coverage can coexist with a narrower public destination', () => {
  assert.deepEqual(
    matchingAccessReasons({ destinations: [{ type: 'all_workers' }] }),
    ['all-workers'],
  );
});

test('managed destination and bypass policy validators are exact', () => {
  assert.equal(appHasOnlyManagedPublicDestination(managedApp(), FCR_PUBLIC_ZONE), true);
  assert.equal(isEveryoneBypassPolicy(bypassPolicy()), true);
  assert.equal(isEveryoneBypassPolicy({ decision: 'allow', include: [{ everyone: {} }] }), false);
});

test('rejects noncanonical FCR account authority before any provider request', async () => {
  let requestCount = 0;
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: {
        CLOUDFLARE_ACCESS_API_TOKEN: READ_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      fetchImpl: async () => {
        requestCount += 1;
        throw new Error('must not fetch');
      },
    }),
    (error) => error?.classification === 'account-authority-mismatch',
  );
  assert.equal(requestCount, 0);
});

test('inspect uses only the dedicated read token and plans exact public destination', async () => {
  const requests = [];
  const receipt = await reconcileFcrPublicAccessZone({
    env: readEnv,
    fetchImpl: fakeFetch({
      applications: [{ id: 'all-workers', name: 'workers', destinations: [{ type: 'all_workers' }] }],
      onRequest(request) {
        requests.push(request);
      },
    }),
  });

  assert.equal(receipt.action, 'would-create-public-bypass');
  assert.equal(receipt.state, 'attention');
  assert.equal(receipt.mutationPerformed, false);
  assert.ok(requests.every((request) => request.authorization === `Bearer ${READ_TOKEN}`));
});

test('inspect never falls back to the admin token', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: adminEnv,
      apply: false,
      fetchImpl: fakeFetch(),
    }),
    /CLOUDFLARE_ACCESS_API_TOKEN is required for Access inspection/,
  );
});

test('apply uses only admin authority and creates exact public destination with Everyone bypass', async () => {
  const requests = [];
  let created = null;
  const receipt = await reconcileFcrPublicAccessZone({
    env: adminEnv,
    apply: true,
    fetchImpl: fakeFetch({
      applications: [{ id: 'all-workers', name: 'workers', destinations: [{ type: 'all_workers' }] }],
      onRequest(request) {
        requests.push(request);
      },
      onCreate(app) {
        created = app;
      },
    }),
  });

  assert.equal(receipt.action, 'created-public-bypass');
  assert.equal(receipt.state, 'mutated-needs-browser-proof');
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.managedApplicationId, 'created-1');
  assert.equal(created.name, FCR_PUBLIC_ACCESS_APP_NAME);
  assert.deepEqual(created.destinations, [{ type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` }]);
  assert.equal(created.policies[0].decision, 'bypass');
  assert.deepEqual(created.policies[0].include, [{ everyone: {} }]);
  assert.ok(requests.every((request) => request.authorization === `Bearer ${ADMIN_TOKEN}`));
});

test('existing exact managed public bypass is idempotent', async () => {
  let createCount = 0;
  const receipt = await reconcileFcrPublicAccessZone({
    env: adminEnv,
    apply: true,
    fetchImpl: fakeFetch({
      applications: [managedApp()],
      policiesByApp: { 'managed-1': [bypassPolicy()] },
      onCreate() {
        createCount += 1;
      },
    }),
  });

  assert.equal(receipt.action, 'already-public-bypass');
  assert.equal(receipt.mutationPerformed, false);
  assert.equal(createCount, 0);
});

test('foreign exact public destination blocks automatic mutation', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: adminEnv,
      apply: true,
      fetchImpl: fakeFetch({
        applications: [{
          id: 'foreign-1',
          name: 'another-owner',
          destinations: [{ type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` }],
        }],
      }),
    }),
    (error) => error?.classification === 'existing-public-access-app-requires-review',
  );
});

test('rollback deletes only the run-created exact managed public bypass', async () => {
  const before = cwd();
  const temp = await mkdtemp(join(tmpdir(), 'fcr-access-test-'));
  try {
    chdir(temp);
    await mkdir('test-results', { recursive: true });
    await writeFile(
      'test-results/fcr-access-front-door-recovery.json',
      `${JSON.stringify({
        schemaVersion: 2,
        scope: 'fcr-access-front-door-recovery',
        accountId: FCR_CLOUDFLARE_ACCOUNT_ID,
        zone: FCR_PUBLIC_ZONE,
        state: 'mutated-needs-browser-proof',
        mutationPerformed: true,
        rollbackPerformed: false,
        managedApplicationId: 'created-1',
        action: 'created-public-bypass',
      })}\n`,
      'utf8',
    );

    let deleted = null;
    const receipt = await rollbackFcrPublicAccessZone({
      env: adminEnv,
      fetchImpl: fakeFetch({
        applications: [managedApp('created-1')],
        policiesByApp: { 'created-1': [bypassPolicy()] },
        onDelete(appId) {
          deleted = appId;
        },
      }),
    });

    assert.equal(deleted, 'created-1');
    assert.equal(receipt.rollbackPerformed, true);
    assert.equal(receipt.action, 'rolled-back-public-bypass');
  } finally {
    chdir(before);
  }
});

test('raw whitespace token is rejected instead of silently trimmed', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: {
        CLOUDFLARE_ACCESS_API_TOKEN: ` ${READ_TOKEN} `,
        CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
      },
      fetchImpl: fakeFetch(),
    }),
    /dedicated Cloudflare Access read credential could not read/,
  );
});
