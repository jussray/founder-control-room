import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
} from './reconcile-cloudflare-access-public-zone.mjs';
import {
  FCR_SPLIT_PUBLIC_ACCESS_APP_NAME,
  classifyFcrPublicWorkerSplit,
  executeFcrPublicWorkerSplit,
  rollbackFcrPublicWorkerSplit,
} from './fcr-access-public-worker-split.mjs';

const ADMIN_TOKEN = 'cf-admin-token-456';
const env = {
  CLOUDFLARE_ACCESS_ADMIN_API_TOKEN: ADMIN_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
};
const MANAGED_PUBLIC_DESTINATIONS = [
  { type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` },
  { type: 'public', uri: `www.${FCR_PUBLIC_ZONE}/*` },
  { type: 'public', uri: `api.${FCR_PUBLIC_ZONE}/version` },
];

function success(result, status = 200) {
  return {
    ok: true,
    status,
    async json() {
      return { success: true, result };
    },
  };
}

function failure(status = 500) {
  return {
    ok: false,
    status,
    async json() {
      return { success: false, errors: [{ code: 10000, message: 'synthetic failure' }] };
    },
  };
}

function allowPolicy(id = 'allow-1') {
  return {
    id,
    decision: 'allow',
    include: [{ email: { email: 'founder@example.test' } }],
    require: [],
    exclude: [],
    precedence: 1,
  };
}

function mixedApp() {
  return {
    id: 'mixed-1',
    name: 'existing FCR mixed Access app',
    type: 'self_hosted',
    domain: FCR_PUBLIC_ZONE,
    session_duration: '24h',
    destinations: [
      { type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` },
      { type: 'worker', worker_id: 'founder-control-room' },
    ],
  };
}

function fakeProvider({
  applications = [mixedApp()],
  policiesByApp = { 'mixed-1': [allowPolicy()] },
  failUpdateAfterWrite = false,
  failCreateAfterWrite = false,
  failDeleteAfterWrite = false,
  driftCreatedAfterWrite = false,
} = {}) {
  const state = {
    applications: structuredClone(applications),
    policiesByApp: structuredClone(policiesByApp),
    requests: [],
  };

  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const parsedBody = options.body ? JSON.parse(options.body) : null;
    state.requests.push({ method, url, body: parsedBody });

    if (url.includes('/access/apps?') && method === 'GET') {
      return success(structuredClone(state.applications));
    }

    const policyMatch = url.match(/\/access\/apps\/([^/]+)\/policies\?/);
    if (policyMatch && method === 'GET') {
      const appId = decodeURIComponent(policyMatch[1]);
      return success(structuredClone(state.policiesByApp[appId] ?? []));
    }

    const appMatch = url.match(/\/access\/apps\/([^/]+)$/);
    if (appMatch && method === 'GET') {
      const appId = decodeURIComponent(appMatch[1]);
      const application = state.applications.find((item) => item.id === appId) ?? null;
      return success(structuredClone(application));
    }

    if (appMatch && method === 'PUT') {
      const appId = decodeURIComponent(appMatch[1]);
      const body = parsedBody;
      const index = state.applications.findIndex((application) => application.id === appId);
      assert.notEqual(index, -1);
      assert.equal(body.domain, state.applications[index].domain);
      assert.equal(body.type, state.applications[index].type);
      assert.equal(body.type, 'self_hosted');
      assert.ok(Array.isArray(body.destinations));
      state.applications[index] = {
        ...state.applications[index],
        destinations: structuredClone(body.destinations),
      };
      return failUpdateAfterWrite ? failure() : success(structuredClone(state.applications[index]));
    }

    if (url.endsWith('/access/apps') && method === 'POST') {
      const body = parsedBody;
      const created = { id: 'public-1', ...body };
      if (driftCreatedAfterWrite) {
        created.destinations = [
          ...structuredClone(body.destinations ?? []),
          { type: 'worker', worker_id: 'unexpected-worker' },
        ];
      }
      state.applications.push(structuredClone(created));
      state.policiesByApp['public-1'] = structuredClone(body.policies ?? []);
      return failCreateAfterWrite ? failure() : success(structuredClone(created), 201);
    }

    if (appMatch && method === 'DELETE') {
      const appId = decodeURIComponent(appMatch[1]);
      state.applications = state.applications.filter((application) => application.id !== appId);
      delete state.policiesByApp[appId];
      return failDeleteAfterWrite ? failure() : success({ id: appId });
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  return { state, fetchImpl };
}

test('split eligibility requires exactly one whole-site public destination and one Worker destination', () => {
  assert.equal(classifyFcrPublicWorkerSplit(mixedApp()).eligible, true);
  assert.equal(classifyFcrPublicWorkerSplit({
    destinations: [
      { type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` },
      { type: 'worker', worker_id: 'founder-control-room' },
      { type: 'preview_worker', worker_id: 'founder-control-room' },
    ],
  }).eligible, false);
  assert.equal(classifyFcrPublicWorkerSplit({
    destinations: [
      { type: 'public', uri: `${FCR_PUBLIC_ZONE}/admin` },
      { type: 'worker', worker_id: 'founder-control-room' },
    ],
  }).eligible, false);
});

test('split preserves Worker authority while creating only the exact public witness destinations', async () => {
  const provider = fakeProvider();
  const receipt = await executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl });

  assert.equal(receipt.state, 'mutated-needs-browser-proof');
  assert.equal(receipt.mutationOutcome, 'performed');
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.sourceApplicationId, 'mixed-1');
  assert.equal(receipt.managedApplicationId, 'public-1');

  const source = provider.state.applications.find((application) => application.id === 'mixed-1');
  const managed = provider.state.applications.find((application) => application.id === 'public-1');
  assert.deepEqual(source.destinations, [{ type: 'worker', worker_id: 'founder-control-room' }]);
  assert.deepEqual(provider.state.policiesByApp['mixed-1'], [allowPolicy()]);
  assert.equal(managed.name, FCR_SPLIT_PUBLIC_ACCESS_APP_NAME);
  assert.equal(managed.domain, `www.${FCR_PUBLIC_ZONE}`);
  assert.deepEqual(managed.destinations, MANAGED_PUBLIC_DESTINATIONS);
  assert.equal(
    managed.destinations.some((destination) => destination.uri === `api.${FCR_PUBLIC_ZONE}/*`),
    false,
  );
  assert.equal(provider.state.policiesByApp['public-1'][0].decision, 'bypass');
  assert.deepEqual(provider.state.policiesByApp['public-1'][0].include, [{ everyone: {} }]);

  const destinationWrites = provider.state.requests.filter((request) => request.method === 'PUT');
  assert.equal(destinationWrites.length, 1);
  assert.equal(destinationWrites[0].body.domain, FCR_PUBLIC_ZONE);
  assert.equal(destinationWrites[0].body.type, 'self_hosted');
});

test('ambiguous Worker-only PUT is reconciled by readback and never blindly retried', async () => {
  const provider = fakeProvider({ failUpdateAfterWrite: true });
  const receipt = await executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl });
  assert.equal(receipt.mutationOutcome, 'performed');
  assert.equal(provider.state.requests.filter((request) => request.method === 'PUT').length, 1);
});

test('ambiguous public-app POST is reconciled by provider inventory and never duplicated', async () => {
  const provider = fakeProvider({ failCreateAfterWrite: true });
  const receipt = await executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl });
  assert.equal(receipt.managedApplicationId, 'public-1');
  assert.equal(receipt.mutationOutcome, 'performed');
  assert.equal(provider.state.requests.filter((request) => request.method === 'POST').length, 1);
  assert.equal(
    provider.state.applications.filter((application) => application.name === FCR_SPLIT_PUBLIC_ACCESS_APP_NAME).length,
    1,
  );
});

test('ambiguous POST with a drifted new application becomes RECONCILE and does not restore mixed scope', async () => {
  const provider = fakeProvider({ failCreateAfterWrite: true, driftCreatedAfterWrite: true });
  await assert.rejects(
    executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl }),
    (error) => error?.classification === 'split-public-create-reconcile-required'
      && error?.mutationOutcome === 'unknown',
  );
  const source = provider.state.applications.find((application) => application.id === 'mixed-1');
  const created = provider.state.applications.find((application) => application.id === 'public-1');
  assert.deepEqual(source.destinations, [{ type: 'worker', worker_id: 'founder-control-room' }]);
  assert.equal(created.destinations.length, MANAGED_PUBLIC_DESTINATIONS.length + 1);
});

test('non-eligible topology fails before any provider write', async () => {
  const provider = fakeProvider({
    applications: [{
      ...mixedApp(),
      destinations: [
        { type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` },
        { type: 'worker', worker_id: 'founder-control-room' },
        { type: 'all_workers' },
      ],
    }],
  });
  await assert.rejects(
    executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl }),
    (error) => error?.classification === 'split-topology-not-eligible'
      && error?.mutationOutcome === 'none',
  );
  assert.equal(
    provider.state.requests.filter((request) => ['PUT', 'POST', 'DELETE'].includes(request.method)).length,
    0,
  );
});

test('rollback deletes the public app before restoring the original mixed destinations', async () => {
  const provider = fakeProvider();
  const receipt = await executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl });
  const requestCountBeforeRollback = provider.state.requests.length;
  const rolledBack = await rollbackFcrPublicWorkerSplit({ receipt, env, fetchImpl: provider.fetchImpl });
  assert.equal(rolledBack.rollbackPerformed, true);
  assert.equal(rolledBack.state, 'rolled-back');
  assert.deepEqual(
    provider.state.applications.find((application) => application.id === 'mixed-1').destinations,
    mixedApp().destinations,
  );
  assert.equal(provider.state.applications.some((application) => application.id === 'public-1'), false);
  const rollbackWrites = provider.state.requests
    .slice(requestCountBeforeRollback)
    .filter((request) => ['DELETE', 'PUT'].includes(request.method));
  assert.deepEqual(rollbackWrites.map((request) => request.method), ['DELETE', 'PUT']);
});

test('ambiguous public-app DELETE is reconciled before source restoration', async () => {
  const provider = fakeProvider({ failDeleteAfterWrite: true });
  const receipt = await executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl });
  const rolledBack = await rollbackFcrPublicWorkerSplit({ receipt, env, fetchImpl: provider.fetchImpl });
  assert.equal(rolledBack.rollbackPerformed, true);
  assert.equal(provider.state.applications.some((application) => application.id === 'public-1'), false);
  assert.deepEqual(
    provider.state.applications.find((application) => application.id === 'mixed-1').destinations,
    mixedApp().destinations,
  );
});

test('rollback refuses to restore mixed scope if the run-created public app drifted', async () => {
  const provider = fakeProvider();
  const receipt = await executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl });
  provider.state.applications
    .find((application) => application.id === 'public-1')
    .destinations.push({ type: 'worker', worker_id: 'unexpected-worker' });
  await assert.rejects(
    rollbackFcrPublicWorkerSplit({ receipt, env, fetchImpl: provider.fetchImpl }),
    (error) => error?.classification === 'split-rollback-managed-app-drift',
  );
  assert.equal(provider.state.applications.some((application) => application.id === 'public-1'), true);
  assert.deepEqual(
    provider.state.applications.find((application) => application.id === 'mixed-1').destinations,
    [{ type: 'worker', worker_id: 'founder-control-room' }],
  );
});
