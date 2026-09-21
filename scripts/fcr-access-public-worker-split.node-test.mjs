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

function response(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return status >= 200 && status < 300
        ? { success: true, result }
        : { success: false, errors: [{ code: 10000, message: 'synthetic failure' }] };
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

function managedApp(id = 'public-1') {
  return {
    id,
    name: FCR_SPLIT_PUBLIC_ACCESS_APP_NAME,
    type: 'self_hosted',
    domain: `www.${FCR_PUBLIC_ZONE}`,
    session_duration: '24h',
    destinations: structuredClone(MANAGED_PUBLIC_DESTINATIONS),
  };
}

function everyoneBypassPolicy() {
  return {
    id: 'bypass-1',
    name: 'Bypass public FCR front door and version witness',
    decision: 'bypass',
    include: [{ everyone: {} }],
    require: [],
    exclude: [],
    precedence: 1,
  };
}

function fakeProvider({
  applications = [mixedApp()],
  policiesByApp = { 'mixed-1': [allowPolicy()] },
  failUpdateAfterWrite = false,
  failCreateAfterWrite = false,
  failDeleteAfterWrite = false,
  hideCreatedOnNextInventoryRead = false,
  onRequest,
} = {}) {
  const state = {
    applications: structuredClone(applications),
    policiesByApp: structuredClone(policiesByApp),
    requests: [],
    createdHiddenReads: 0,
  };

  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    state.requests.push({ method, url, body: structuredClone(body) });
    onRequest?.({ method, url, body, state });

    if (url.includes('/access/apps?') && method === 'GET') {
      let apps = structuredClone(state.applications);
      if (hideCreatedOnNextInventoryRead && state.createdHiddenReads === 0
        && state.applications.some((application) => application.id === 'public-1')) {
        apps = apps.filter((application) => application.id !== 'public-1');
        state.createdHiddenReads += 1;
      }
      return response(apps);
    }

    const policyMatch = url.match(/\/access\/apps\/([^/]+)\/policies\?/);
    if (policyMatch && method === 'GET') {
      const appId = decodeURIComponent(policyMatch[1]);
      return response(structuredClone(state.policiesByApp[appId] ?? []));
    }

    const appMatch = url.match(/\/access\/apps\/([^/?]+)$/);
    if (appMatch && method === 'GET') {
      const appId = decodeURIComponent(appMatch[1]);
      return response(structuredClone(state.applications.find((application) => application.id === appId) ?? null));
    }

    if (appMatch && method === 'PUT') {
      const appId = decodeURIComponent(appMatch[1]);
      const index = state.applications.findIndex((application) => application.id === appId);
      assert.notEqual(index, -1);
      state.applications[index] = {
        ...state.applications[index],
        domain: body.domain,
        type: body.type,
        destinations: structuredClone(body.destinations),
      };
      return failUpdateAfterWrite
        ? response(null, 500)
        : response(structuredClone(state.applications[index]));
    }

    if (url.endsWith('/access/apps') && method === 'POST') {
      const created = { id: 'public-1', ...structuredClone(body) };
      state.applications.push(created);
      state.policiesByApp['public-1'] = [everyoneBypassPolicy()];
      return failCreateAfterWrite
        ? response(null, 500)
        : response(structuredClone(created), 201);
    }

    if (appMatch && method === 'DELETE') {
      const appId = decodeURIComponent(appMatch[1]);
      state.applications = state.applications.filter((application) => application.id !== appId);
      delete state.policiesByApp[appId];
      return failDeleteAfterWrite ? response(null, 500) : response({ id: appId });
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  return { state, fetchImpl };
}

function receiptStore() {
  const receipts = [];
  return {
    receipts,
    persistReceipt: async (receipt) => {
      receipts.push(structuredClone(receipt));
    },
  };
}

async function applySplit(provider = fakeProvider()) {
  const store = receiptStore();
  const receipt = await executeFcrPublicWorkerSplit({
    env,
    fetchImpl: provider.fetchImpl,
    persistReceipt: store.persistReceipt,
  });
  return { provider, store, receipt };
}

test('split eligibility is exactly one whole-site public destination plus one Worker destination', () => {
  assert.equal(classifyFcrPublicWorkerSplit(mixedApp()).eligible, true);
  assert.equal(classifyFcrPublicWorkerSplit({
    destinations: [
      { type: 'public', uri: `${FCR_PUBLIC_ZONE}/*` },
      { type: 'worker', worker_id: 'founder-control-room' },
      { type: 'all_workers' },
    ],
  }).eligible, false);
});

test('zone authority is pinned before any provider request', async () => {
  let requests = 0;
  await assert.rejects(
    executeFcrPublicWorkerSplit({
      env,
      zone: 'other.example',
      persistReceipt: async () => {},
      fetchImpl: async () => { requests += 1; throw new Error('must not call provider'); },
    }),
    (error) => error?.classification === 'split-zone-authority-mismatch',
  );
  assert.equal(requests, 0);
});

test('account authority is pinned before any provider request', async () => {
  let requests = 0;
  await assert.rejects(
    executeFcrPublicWorkerSplit({
      env: { ...env, CLOUDFLARE_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      persistReceipt: async () => {},
      fetchImpl: async () => { requests += 1; throw new Error('must not call provider'); },
    }),
    (error) => error?.classification === 'account-authority-mismatch',
  );
  assert.equal(requests, 0);
});

test('provider mutation requires a durable receipt writer before provider inspection', async () => {
  let requests = 0;
  await assert.rejects(
    executeFcrPublicWorkerSplit({
      env,
      fetchImpl: async () => { requests += 1; throw new Error('must not call provider'); },
    }),
    (error) => error?.classification === 'split-durable-receipt-required',
  );
  assert.equal(requests, 0);
});

test('durable unknown checkpoint is persisted before the first provider write', async () => {
  const store = receiptStore();
  const provider = fakeProvider({
    onRequest({ method }) {
      if (method === 'PUT') {
        assert.equal(store.receipts.at(-1)?.phase, 'source-update-pending');
        assert.equal(store.receipts.at(-1)?.mutationOutcome, 'unknown');
      }
    },
  });
  await executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl, persistReceipt: store.persistReceipt });
  assert.ok(store.receipts.some((receipt) => receipt.phase === 'prepared'));
  assert.ok(store.receipts.some((receipt) => receipt.phase === 'source-update-pending'));
});

test('source identity and exact destinations are revalidated at the PUT boundary', async () => {
  const provider = fakeProvider({
    onRequest({ method, url, state }) {
      if (method === 'GET' && /\/access\/apps\/mixed-1$/.test(url)) {
        state.applications[0].destinations.push({ type: 'worker', worker_id: 'concurrent-worker' });
      }
    },
  });
  const store = receiptStore();
  await assert.rejects(
    executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl, persistReceipt: store.persistReceipt }),
    (error) => error?.classification === 'split-source-drift-before-write'
      || error?.classification === 'split-source-update-reconcile-required',
  );
  assert.equal(provider.state.requests.some((request) => request.method === 'PUT'), false);
  assert.equal(provider.state.requests.some((request) => request.method === 'POST'), false);
});

test('foreign overlap on www or api/version blocks before any provider write', async () => {
  const provider = fakeProvider({
    applications: [
      mixedApp(),
      {
        id: 'foreign',
        name: 'foreign api app',
        type: 'self_hosted',
        domain: `api.${FCR_PUBLIC_ZONE}`,
        destinations: [{ type: 'public', uri: `api.${FCR_PUBLIC_ZONE}/*` }],
      },
    ],
  });
  const store = receiptStore();
  await assert.rejects(
    executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl, persistReceipt: store.persistReceipt }),
    (error) => error?.classification === 'split-public-destination-collision',
  );
  assert.equal(provider.state.requests.some((request) => ['PUT', 'POST', 'DELETE'].includes(request.method)), false);
});

test('split verifies the exact Worker destination rather than any worker-shaped destination', async () => {
  let drifted = false;
  const provider = fakeProvider({
    onRequest({ method, url, state }) {
      if (!drifted && method === 'GET' && url.includes('/access/apps?')
        && state.applications[0]?.destinations?.length === 1) {
        state.applications[0].destinations = [{ type: 'worker', worker_id: 'wrong-worker' }];
        drifted = true;
      }
    },
  });
  const store = receiptStore();
  await assert.rejects(
    executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl, persistReceipt: store.persistReceipt }),
    (error) => ['split-source-narrowing-unverified', 'split-source-identity-drift'].includes(error?.classification),
  );
  assert.equal(provider.state.requests.some((request) => request.method === 'POST'), false);
});

test('ambiguous POST plus temporarily empty inventory remains UNKNOWN and never restores mixed scope', async () => {
  const provider = fakeProvider({
    failCreateAfterWrite: true,
    hideCreatedOnNextInventoryRead: true,
  });
  const store = receiptStore();
  await assert.rejects(
    executeFcrPublicWorkerSplit({ env, fetchImpl: provider.fetchImpl, persistReceipt: store.persistReceipt }),
    (error) => error?.classification === 'split-public-create-reconcile-required'
      && error?.mutationOutcome === 'unknown',
  );
  assert.deepEqual(
    provider.state.applications.find((application) => application.id === 'mixed-1').destinations,
    [{ type: 'worker', worker_id: 'founder-control-room' }],
  );
  assert.equal(provider.state.requests.filter((request) => request.method === 'PUT').length, 1);
  assert.equal(store.receipts.at(-1).phase, 'public-create-outcome-unknown');
});

test('successful split persists every mutation phase and exact bounded public topology', async () => {
  const { provider, store, receipt } = await applySplit();
  const phases = new Set(store.receipts.map((item) => item.phase));
  for (const phase of [
    'prepared',
    'source-update-pending',
    'source-narrowed',
    'public-create-pending',
    'public-created-pending-proof',
    'split-applied',
  ]) assert.equal(phases.has(phase), true, `missing phase ${phase}`);
  assert.equal(receipt.state, 'mutated-needs-browser-proof');
  assert.equal(receipt.splitApplied, true);
  const source = provider.state.applications.find((application) => application.id === 'mixed-1');
  const managed = provider.state.applications.find((application) => application.id === 'public-1');
  assert.deepEqual(source.destinations, [{ type: 'worker', worker_id: 'founder-control-room' }]);
  assert.equal(managed.name, FCR_SPLIT_PUBLIC_ACCESS_APP_NAME);
  assert.equal(managed.type, 'self_hosted');
  assert.equal(managed.domain, `www.${FCR_PUBLIC_ZONE}`);
  assert.deepEqual(managed.destinations, MANAGED_PUBLIC_DESTINATIONS);
});

test('managed app domain or type drift is not accepted as the receipt-bound public application', async () => {
  const { provider, receipt } = await applySplit();
  provider.state.applications.find((application) => application.id === 'public-1').domain = FCR_PUBLIC_ZONE;
  const rollbackStore = receiptStore();
  await assert.rejects(
    rollbackFcrPublicWorkerSplit({
      receipt,
      env,
      fetchImpl: provider.fetchImpl,
      persistReceipt: rollbackStore.persistReceipt,
    }),
    (error) => error?.classification === 'split-rollback-managed-app-drift',
  );
  assert.equal(provider.state.requests.filter((request) => request.method === 'DELETE').length, 0);
});

test('rollback validates protected source before deleting the public app', async () => {
  const { provider, receipt } = await applySplit();
  provider.state.policiesByApp['mixed-1'].push(allowPolicy('concurrent-policy'));
  const rollbackStore = receiptStore();
  const deletesBefore = provider.state.requests.filter((request) => request.method === 'DELETE').length;
  await assert.rejects(
    rollbackFcrPublicWorkerSplit({
      receipt,
      env,
      fetchImpl: provider.fetchImpl,
      persistReceipt: rollbackStore.persistReceipt,
    }),
    (error) => error?.classification === 'split-rollback-source-drift',
  );
  assert.equal(provider.state.requests.filter((request) => request.method === 'DELETE').length, deletesBefore);
  assert.equal(provider.state.applications.some((application) => application.id === 'public-1'), true);
});

test('rollback blocks restoration when the original public app is replaced under a new ID', async () => {
  const { provider, receipt } = await applySplit();
  provider.state.applications = provider.state.applications.filter((application) => application.id !== 'public-1');
  provider.state.applications.push(managedApp('replacement-1'));
  provider.state.policiesByApp['replacement-1'] = [everyoneBypassPolicy()];
  const rollbackStore = receiptStore();
  const putsBefore = provider.state.requests.filter((request) => request.method === 'PUT').length;
  await assert.rejects(
    rollbackFcrPublicWorkerSplit({
      receipt,
      env,
      fetchImpl: provider.fetchImpl,
      persistReceipt: rollbackStore.persistReceipt,
    }),
    (error) => error?.classification === 'split-rollback-managed-app-drift'
      || error?.classification === 'split-rollback-public-replacement-detected',
  );
  assert.equal(provider.state.requests.filter((request) => request.method === 'PUT').length, putsBefore);
  assert.deepEqual(
    provider.state.applications.find((application) => application.id === 'mixed-1').destinations,
    [{ type: 'worker', worker_id: 'founder-control-room' }],
  );
});

test('rollback pins receipt zone before any provider request', async () => {
  const provider = fakeProvider();
  const store = receiptStore();
  await assert.rejects(
    rollbackFcrPublicWorkerSplit({
      receipt: {
        scope: 'fcr-access-public-worker-split',
        zone: 'other.example',
        mutationOutcome: 'performed',
      },
      env,
      fetchImpl: provider.fetchImpl,
      persistReceipt: store.persistReceipt,
    }),
    (error) => error?.classification === 'split-zone-authority-mismatch',
  );
  assert.equal(provider.state.requests.length, 0);
});

test('exact rollback deletes only the receipt-bound public app then restores exact original destinations', async () => {
  const { provider, receipt } = await applySplit();
  const rollbackStore = receiptStore();
  const before = provider.state.requests.length;
  const rolledBack = await rollbackFcrPublicWorkerSplit({
    receipt,
    env,
    fetchImpl: provider.fetchImpl,
    persistReceipt: rollbackStore.persistReceipt,
  });
  assert.equal(rolledBack.rollbackPerformed, true);
  assert.equal(rolledBack.state, 'rolled-back');
  assert.equal(provider.state.applications.some((application) => application.id === 'public-1'), false);
  assert.deepEqual(
    provider.state.applications.find((application) => application.id === 'mixed-1').destinations,
    mixedApp().destinations,
  );
  const mutationMethods = provider.state.requests.slice(before)
    .filter((request) => ['DELETE', 'PUT'].includes(request.method))
    .map((request) => request.method);
  assert.deepEqual(mutationMethods, ['DELETE', 'PUT']);
  assert.ok(rollbackStore.receipts.some((item) => item.phase === 'rollback-public-delete-pending'));
  assert.ok(rollbackStore.receipts.some((item) => item.phase === 'rollback-source-restore-pending'));
  assert.equal(rollbackStore.receipts.at(-1).phase, 'rolled-back');
});

test('ambiguous delete is reconciled without a second DELETE before source restoration', async () => {
  const provider = fakeProvider({ failDeleteAfterWrite: true });
  const { receipt } = await applySplit(provider);
  const rollbackStore = receiptStore();
  const rolledBack = await rollbackFcrPublicWorkerSplit({
    receipt,
    env,
    fetchImpl: provider.fetchImpl,
    persistReceipt: rollbackStore.persistReceipt,
  });
  assert.equal(rolledBack.rollbackPerformed, true);
  assert.equal(provider.state.requests.filter((request) => request.method === 'DELETE').length, 1);
});
