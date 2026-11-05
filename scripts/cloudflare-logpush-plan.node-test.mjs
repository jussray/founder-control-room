import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileLogpush, validateConfig } from './cloudflare-logpush-plan.mjs';

const config = {
  schemaVersion: '1.0',
  authority: {
    repository: 'jussray/founder-control-room',
    provider: 'cloudflare',
    mutationPolicy: 'manual-founder-gated',
    accountIdEnv: 'CLOUDFLARE_ACCOUNT_ID',
    inspectTokenEnv: 'CLOUDFLARE_LOGPUSH_READ_TOKEN',
    applyTokenEnv: 'CLOUDFLARE_LOGPUSH_WRITE_TOKEN',
    destinationEnv: 'CLOUDFLARE_LOGPUSH_DESTINATION_CONF',
    approvalReferenceEnv: 'APPROVAL_REFERENCE',
  },
  jobs: [{ name: 'fcr-portfolio-workers-trace', scope: 'account', dataset: 'workers_trace_events', enabled: true }],
  repositories: ['jussray/founder-control-room', 'jussray/chief-ai-machine'],
};

function response(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return status >= 200 && status < 300
        ? { success : true, result }
        : { success : false, errors : [{ code : 10000, message : 'forbidden' }] };
    },
  };
}

function fakeFetch(initial = []) {
  const state = initial.map((item) => structuredClone(item));
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    requests.push({ url, method, body : options.body ? JSON.parse(options.body) : null });
    if (method === 'GET') return response(state);
    if (method === 'POST') {
      const body = JSON.parse(options.body);
      const created = { id: 41, ...body, last_complete: '', last_error: '', error_message: '' };
      state.push(created);
      return response(created);
    }
    if (method === 'PUT') {
      const id = Number(url.split('/').at(-1));
      const body = JSON.parse(options.body);
      const index = state.findIndex((item) => item.id === id);
      state[index] = { ...state[index], ...body };
      return response(state[index]);
    }
    return response({}, 405);
  };
  return { fetchImpl, requests, state };
}

const inspectEnv = {
  CLOUDFLARE_ACCOUNT_ID: 'acct-123',
  CLOUDFLARE_LOGPUSH_READ_TOKEN: 'read-token',
};
const applyEnv = {
  CLOUDFLARE_ACCOUNT_ID: 'acct-123',
  CLOUDFLARE_LOGPUSH_WRITE_TOKEN: 'write-token',
  CLOUDFLARE_LOGPUSH_DESTINATION_CONF: 'https://logs.example.invalid/intake?token=secret',
  APPROVAL_REFERENCE: 'approved-logpush-2026-10-26',
};

test('validates founder-gated account-scoped portfolio configuration', () => {
  assert.equal(validateConfig(config), config);
  assert.throws(
    () => validateConfig({ ...config, authority: { ...config.authority, mutationPolicy: 'automatic' } }),
    /manual-founder-gated/,
  );
});

test('inspect reports a missing job without mutating provider state', async () => {
  const provider = fakeFetch([]);
  const receipt = await reconcileLogpush({ config, env: inspectEnv, fetchImpl: provider.fetchImpl });
  assert.equal(receipt.mutationPerformed, false);
  assert.equal(receipt.jobs[0].action, 'would-create');
  assert.deepEqual(provider.requests.map((item) => item.method), ['GET']);
});

test('inspect of an existing job does not claim full verification without destination comparison', async () => {
  const provider = fakeFetch([{ id: 7, name: 'fcr-portfolio-workers-trace', dataset: 'workers_trace_events', enabled: true, destination_conf: 'https://provider-held.invalid/secret' }]);
  const receipt = await reconcileLogpush({ config, env: inspectEnv, fetchImpl: provider.fetchImpl });
  assert.equal(receipt.jobs[0].action, 'none');
  assert.equal(receipt.readback[0].destinationVerified, null);
  assert.equal(receipt.readback[0].verified, false);
  assert.equal(receipt.verified, false);
  assert.equal(receipt.mutationPerformed, false);
});

test('apply creates the exact job and verifies provider readback', async () => {
  const provider = fakeFetch([]);
  const receipt = await reconcileLogpush({ config, env: applyEnv, fetchImpl: provider.fetchImpl, apply: true });
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.jobs[0].action, 'created');
  assert.equal(receipt.verified, true);
  assert.deepEqual(provider.requests.map((item) => item.method), ['GET', 'POST', 'GET']);
  assert.equal(JSON.stringify(receipt).includes('logs.example.invalid'), false);
  assert.equal(JSON.stringify(receipt).includes('write-token'), false);
});

test('apply updates a drifted job and then proves exact readback', async () => {
  const provider = fakeFetch([{ id: 9, name: 'fcr-portfolio-workers-trace', dataset: 'workers_trace_events', enabled: false, destination_conf: 'https://old.invalid' }]);
  const receipt = await reconcileLogpush({ config, env: applyEnv, fetchImpl: provider.fetchImpl, apply: true });
  assert.equal(receipt.jobs[0].action, 'updated');
  assert.deepEqual(receipt.jobs[0].differences.sort(), ['destination', 'enabled']);
  assert.equal(receipt.verified, true);
});

test('apply refuses to continue without an approval reference', async () => {
  await assert.rejects(
    reconcileLogpush({
      config,
      env: { CLOUDFLARE_ACCOUNT_ID: 'acct-123', CLOUDFLARE_LOGPUSH_WRITE_TOKEN: 'write-token', CLOUDFLARE_LOGPUSH_DESTINATION_CONF: 'https://logs.example.invalid' },
      fetchImpl: fakeFetch([]).fetchImpl,
      apply: true,
    }),
    (error) => error?.classification === 'approval-reference-required-for-apply',
  );
});

test('apply refuses to continue without a destination', async () => {
  await assert.rejects(
    reconcileLogpush({
      config,
      env: { CLOUDFLARE_ACCOUNT_ID: 'acct-123', CLOUDFLARE_LOGPUSH_WRITE_TOKEN: 'write-token', APPROVAL_REFERENCE: 'approved-logpush-2026-10-26' },
      fetchImpl: fakeFetch([]).fetchImpl,
      apply: true,
    }),
    (error) => error?.classification === 'destination-required-for-apply',
  );
});

test('duplicate provider jobs fail closed', async () => {
  const provider = fakeFetch([
    { id: 1, name: 'fcr-portfolio-workers-trace', dataset: 'workers_trace_events', enabled: true },
    { id: 2, name: 'fcr-portfolio-workers-trace', dataset: 'workers_trace_events', enabled: true },
  ]);
  await assert.rejects(
    reconcileLogpush({ config, env: inspectEnv, fetchImpl: provider.fetchImpl }),
    (error) => error?.classification === 'duplicate-provider-jobs',
  );
});
