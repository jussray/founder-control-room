import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureChiefProofModeAccessPolicy } from './reconcile-chief-proofmode-access.mjs';

const ACCOUNT = 'account-1';
const READ_TOKEN = 'read-token';
const ADMIN_TOKEN = 'admin-token';
const CLIENT_ID = 'client-id.access';
const SERVICE_ID = 'service-token-1';
const APP_NAME = 'chief-ai - Cloudflare Workers';
const TARGET = 'https://5a188322-chief-ai.mcgill-raylene.workers.dev';
const HOST = '5a188322-chief-ai.mcgill-raylene.workers.dev';

function response(result, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return {
        success: status >= 200 && status < 300,
        result,
        errors: [],
        result_info: { page: 1, per_page: 100, total_pages: 1 },
      };
    },
  };
}

function routeFetch({ serviceTokens, apps, policiesByApp = {}, createByApp = {} }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/access/service_tokens')) return response(serviceTokens);
    if (parsed.pathname.endsWith('/access/apps')) return response(apps);
    const policyMatch = parsed.pathname.match(/\/access\/apps\/([^/]+)\/policies$/);
    if (policyMatch) {
      const appId = decodeURIComponent(policyMatch[1]);
      if (!init.method) return response(policiesByApp[appId] || []);
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        return response(createByApp[appId] || { id: 'policy-new', ...body });
      }
    }
    throw new Error(`Unexpected Cloudflare request: ${url}`);
  };
  return { fetchImpl, calls };
}

const activeToken = {
  id: SERVICE_ID,
  client_id: CLIENT_ID,
  enabled: true,
  expires_at: '2027-08-30T00:00:00Z',
};

const exactPublicApp = {
  id: 'app-exact-public',
  name: 'ProofMode exact immutable preview',
  destinations: [{ type: 'public', uri: `${HOST}/*` }],
};

const workerApp = {
  id: 'app-worker',
  name: APP_NAME,
  destinations: [{ type: 'worker', worker_id: 'worker-1' }],
};

const previewWorkerApp = {
  id: 'app-preview-worker',
  name: APP_NAME,
  destinations: [{ type: 'preview_worker', worker_id: 'worker-1' }],
};

const baseArgs = {
  mode: 'check',
  accountId: ACCOUNT,
  apiToken: READ_TOKEN,
  targetUrl: TARGET,
  serviceClientId: CLIENT_ID,
  applicationName: APP_NAME,
  nowMs: Date.parse('2026-08-30T00:00:00Z'),
};

test('accepts only the configured service token on an existing exact-host Service Auth policy', async () => {
  const { fetchImpl, calls } = routeFetch({
    serviceTokens: [activeToken],
    apps: [workerApp, exactPublicApp],
    policiesByApp: {
      [exactPublicApp.id]: [{
        id: 'policy-1',
        decision: 'non_identity',
        include: [{ service_token: { token_id: SERVICE_ID } }],
      }],
    },
  });

  const result = await ensureChiefProofModeAccessPolicy({ ...baseArgs, fetchImpl });
  assert.deepEqual(result, {
    state: 'configured',
    changed: false,
    appId: exactPublicApp.id,
    policyId: 'policy-1',
    scope: 'public_exact_host',
    serviceTokenId: SERVICE_ID,
    targetOrigin: TARGET,
  });
  assert.equal(calls.length, 3);
});

test('accepts the configured service-token ID without requiring a client ID', async () => {
  const { fetchImpl, calls } = routeFetch({
    serviceTokens: [activeToken],
    apps: [workerApp, exactPublicApp],
    policiesByApp: {
      [exactPublicApp.id]: [{
        id: 'policy-1',
        decision: 'non_identity',
        include: [{ service_token: { token_id: SERVICE_ID } }],
      }],
    },
  });

  const result = await ensureChiefProofModeAccessPolicy({
    ...baseArgs,
    serviceClientId: undefined,
    serviceTokenId: SERVICE_ID,
    fetchImpl,
  });
  assert.equal(result.changed, false);
  assert.equal(result.serviceTokenId, SERVICE_ID);
  assert.equal(calls.length, 3);
});

test('fails closed when configured token ID and client ID identify different service tokens', async () => {
  const { fetchImpl, calls } = routeFetch({
    serviceTokens: [{ ...activeToken, client_id: 'different-client.access' }],
    apps: [exactPublicApp],
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...baseArgs,
      serviceTokenId: SERVICE_ID,
      fetchImpl,
    }),
    /does not match the configured client ID/,
  );
  assert.equal(calls.length, 1);
});

test('rejects non-immutable or path-bearing targets before provider access', async () => {
  const { fetchImpl, calls } = routeFetch({ serviceTokens: [], apps: [] });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...baseArgs,
      targetUrl: 'https://chief-ai.mcgill-raylene.workers.dev/version',
      fetchImpl,
    }),
    /immutable Chief workers\.dev preview origin/,
  );
  assert.equal(calls.length, 0);
});

test('fails closed for disabled and expired service tokens', async () => {
  const disabled = routeFetch({ serviceTokens: [{ ...activeToken, enabled: false }], apps: [exactPublicApp] });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({ ...baseArgs, fetchImpl: disabled.fetchImpl }),
    /disabled/,
  );
  assert.equal(disabled.calls.length, 1);

  const expired = routeFetch({
    serviceTokens: [{ ...activeToken, expires_at: '2026-08-29T23:59:59Z' }],
    apps: [exactPublicApp],
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({ ...baseArgs, fetchImpl: expired.fetchImpl }),
    /expired/,
  );
  assert.equal(expired.calls.length, 1);
});

test('refuses repair on preview_worker or broad public scope', async () => {
  const preview = routeFetch({
    serviceTokens: [activeToken],
    apps: [workerApp, previewWorkerApp],
    policiesByApp: { [previewWorkerApp.id]: [] },
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...baseArgs,
      mode: 'repair',
      apiToken: ADMIN_TOKEN,
      fetchImpl: preview.fetchImpl,
    }),
    /scope preview_worker/,
  );
  assert.equal(preview.calls.filter(({ init }) => init.method === 'POST').length, 0);

  const broadApp = {
    id: 'app-broad',
    name: 'Broad protection',
    destinations: [{ type: 'public', uri: '*.mcgill-raylene.workers.dev/*' }],
  };
  const broad = routeFetch({
    serviceTokens: [activeToken],
    apps: [workerApp, broadApp],
    policiesByApp: { [broadApp.id]: [] },
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...baseArgs,
      mode: 'repair',
      apiToken: ADMIN_TOKEN,
      fetchImpl: broad.fetchImpl,
    }),
    /public_path_or_multi_destination/,
  );
  assert.equal(broad.calls.filter(({ init }) => init.method === 'POST').length, 0);
});

test('refuses ambiguous Access precedence and conflicting named policies', async () => {
  const duplicate = routeFetch({
    serviceTokens: [activeToken],
    apps: [exactPublicApp, { ...exactPublicApp, id: 'app-exact-public-2' }],
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({ ...baseArgs, fetchImpl: duplicate.fetchImpl }),
    /Multiple public Access applications/,
  );

  const conflict = routeFetch({
    serviceTokens: [activeToken],
    apps: [exactPublicApp],
    policiesByApp: {
      [exactPublicApp.id]: [{
        id: 'policy-wrong',
        name: 'ProofMode CI service auth',
        decision: 'allow',
        include: [{ everyone: {} }],
      }],
    },
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...baseArgs,
      mode: 'repair',
      apiToken: ADMIN_TOKEN,
      fetchImpl: conflict.fetchImpl,
    }),
    /refusing automatic overwrite/,
  );
  assert.equal(conflict.calls.filter(({ init }) => init.method === 'POST').length, 0);
});

test('repair creates exactly one specific non-identity service-token policy', async () => {
  const { fetchImpl, calls } = routeFetch({
    serviceTokens: [activeToken],
    apps: [workerApp, exactPublicApp],
    policiesByApp: { [exactPublicApp.id]: [] },
  });
  const result = await ensureChiefProofModeAccessPolicy({
    ...baseArgs,
    mode: 'repair',
    apiToken: ADMIN_TOKEN,
    fetchImpl,
  });
  assert.equal(result.changed, true);
  assert.equal(result.scope, 'public_exact_host');
  const posts = calls.filter(({ init }) => init.method === 'POST');
  assert.equal(posts.length, 1);
  const body = JSON.parse(posts[0].init.body);
  assert.deepEqual(body, {
    name: 'ProofMode CI service auth',
    decision: 'non_identity',
    include: [{ service_token: { token_id: SERVICE_ID } }],
  });
  assert.notEqual(body.decision, 'bypass');
  assert.equal('any_valid_service_token' in body.include[0], false);
});

test('provider credential appears only in Authorization header', async () => {
  const { fetchImpl, calls } = routeFetch({
    serviceTokens: [activeToken],
    apps: [exactPublicApp],
    policiesByApp: {
      [exactPublicApp.id]: [{
        id: 'policy-1',
        decision: 'non_identity',
        include: [{ service_token: { token_id: SERVICE_ID } }],
      }],
    },
  });
  await ensureChiefProofModeAccessPolicy({ ...baseArgs, fetchImpl });
  for (const call of calls) {
    assert.equal(call.url.includes(READ_TOKEN), false);
    assert.equal(String(call.init.body || '').includes(READ_TOKEN), false);
    assert.equal(call.init.headers.Authorization, `Bearer ${READ_TOKEN}`);
  }
});

test('check mode cannot create a policy', async () => {
  const { fetchImpl, calls } = routeFetch({
    serviceTokens: [activeToken],
    apps: [exactPublicApp],
    policiesByApp: { [exactPublicApp.id]: [] },
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({ ...baseArgs, fetchImpl }),
    /No matching Chief Service Auth policy/,
  );
  assert.equal(calls.filter(({ init }) => init.method === 'POST').length, 0);
});
