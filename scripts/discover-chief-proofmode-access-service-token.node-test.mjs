import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverChiefProofModeServiceTokenId } from './discover-chief-proofmode-access-service-token.mjs';

const ACCOUNT = 'account-1';
const READ_TOKEN = 'read-token';
const SERVICE_ID = 'service-token-1';
const APP_NAME = 'chief-ai - Cloudflare Workers';
const TARGET = 'https://657f9f70-chief-ai.mcgill-raylene.workers.dev';
const HOST = '657f9f70-chief-ai.mcgill-raylene.workers.dev';

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

function routeFetch({ apps, policiesByApp = {}, serviceTokens = [] }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/access/apps')) return response(apps);
    if (parsed.pathname.endsWith('/access/service_tokens')) return response(serviceTokens);
    const policyMatch = parsed.pathname.match(/\/access\/apps\/([^/]+)\/policies$/);
    if (policyMatch) return response(policiesByApp[decodeURIComponent(policyMatch[1])] || []);
    throw new Error(`Unexpected Cloudflare request: ${url}`);
  };
  return { fetchImpl, calls };
}

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

const exactPreviewApp = {
  id: 'app-exact',
  name: 'Exact Chief preview',
  destinations: [{ type: 'public', uri: `${HOST}/*` }],
};

const servicePolicy = {
  id: 'policy-service',
  decision: 'non_identity',
  include: [{ service_token: { token_id: SERVICE_ID } }],
};

const activeToken = {
  id: SERVICE_ID,
  enabled: true,
  expires_at: '2027-09-12T00:00:00Z',
};

const baseArgs = {
  accountId: ACCOUNT,
  apiToken: READ_TOKEN,
  targetUrl: TARGET,
  applicationName: APP_NAME,
  nowMs: Date.parse('2026-09-12T00:00:00Z'),
};

test('discovers one Chief-bound service token from sibling worker policy without exposing another app', async () => {
  const unrelated = {
    id: 'other-app',
    name: 'Other app',
    destinations: [{ type: 'worker', worker_id: 'worker-2' }],
  };
  const { fetchImpl, calls } = routeFetch({
    apps: [workerApp, previewWorkerApp, exactPreviewApp, unrelated],
    policiesByApp: {
      [workerApp.id]: [servicePolicy],
      [previewWorkerApp.id]: [servicePolicy],
      [exactPreviewApp.id]: [],
      [unrelated.id]: [{
        id: 'other-policy',
        decision: 'non_identity',
        include: [{ service_token: { token_id: 'other-token' } }],
      }],
    },
    serviceTokens: [activeToken, { id: 'other-token', enabled: true }],
  });

  const result = await discoverChiefProofModeServiceTokenId({ ...baseArgs, fetchImpl });
  assert.equal(result.serviceTokenId, SERVICE_ID);
  assert.equal(result.relatedApplicationCount, 3);
  assert.equal(result.targetOrigin, TARGET);
  assert.equal(calls.some(({ url }) => url.includes('/access/apps/other-app/policies')), false);
  for (const call of calls) {
    assert.equal(call.init.headers.Authorization, `Bearer ${READ_TOKEN}`);
    assert.equal(call.url.includes(READ_TOKEN), false);
  }
});

test('fails closed when no Chief policy already binds a service token', async () => {
  const { fetchImpl } = routeFetch({
    apps: [workerApp, exactPreviewApp],
    policiesByApp: { [workerApp.id]: [], [exactPreviewApp.id]: [] },
    serviceTokens: [activeToken],
  });
  await assert.rejects(
    discoverChiefProofModeServiceTokenId({ ...baseArgs, fetchImpl }),
    /No existing non-identity service-token binding exists on the bounded Chief Access application set/,
  );
});

test('fails closed when bounded Chief policies bind multiple service-token identities', async () => {
  const { fetchImpl } = routeFetch({
    apps: [workerApp, exactPreviewApp],
    policiesByApp: {
      [workerApp.id]: [servicePolicy],
      [exactPreviewApp.id]: [{
        id: 'other-policy',
        decision: 'non_identity',
        include: [{ service_token: { token_id: 'other-token' } }],
      }],
    },
    serviceTokens: [activeToken, { id: 'other-token', enabled: true }],
  });
  await assert.rejects(
    discoverChiefProofModeServiceTokenId({ ...baseArgs, fetchImpl }),
    /Multiple service-token identities exist on the bounded Chief Access application set; found 2/,
  );
});

test('rejects disabled or expired discovered service tokens', async () => {
  const disabled = routeFetch({
    apps: [workerApp, exactPreviewApp],
    policiesByApp: { [workerApp.id]: [servicePolicy], [exactPreviewApp.id]: [] },
    serviceTokens: [{ ...activeToken, enabled: false }],
  });
  await assert.rejects(
    discoverChiefProofModeServiceTokenId({ ...baseArgs, fetchImpl: disabled.fetchImpl }),
    /disabled/,
  );

  const expired = routeFetch({
    apps: [workerApp, exactPreviewApp],
    policiesByApp: { [workerApp.id]: [servicePolicy], [exactPreviewApp.id]: [] },
    serviceTokens: [{ ...activeToken, expires_at: '2026-09-11T23:59:59Z' }],
  });
  await assert.rejects(
    discoverChiefProofModeServiceTokenId({ ...baseArgs, fetchImpl: expired.fetchImpl }),
    /expired/,
  );
});
