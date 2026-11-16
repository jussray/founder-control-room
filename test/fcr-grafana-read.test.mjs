import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGrafana } from '../scripts/fcr-grafana-read.mjs';

const UID = 'existing-supabase-dashboard';
const EXPECTED = 'iuxworqsqnyilbxrfctv';
const STORYENGINE = 'tarnmxcjpvaxapnjnesf';

function mockFetch(payload, { status = 200, check } = {}) {
  return async (url, options) => {
    check?.(url, options);
    return { ok: status === 200, status, text: async () => JSON.stringify(payload) };
  };
}
function dashboard(project = EXPECTED) {
  return { dashboard: {
    uid: UID, title: 'Supabase Project',
    templating: { list: [
      { name: 'project', current: { value: project } },
      { name: 'supabase_identifier', current: { value: project } }
    ] },
    panels: [
      { id: 328, title: 'Realtime replication status', targets: [{ expr: 'replication_realtime_slot_status{job="db"}' }], fieldConfig: { defaults: { noValue: 'No slot metrics observed' } } },
      { id: 329, title: 'Realtime replication lag', targets: [{ expr: 'replication_realtime_lag_bytes' }] },
      { id: 14, title: 'CPU Cores', gridPos: { w: 2 }, options: { textMode: 'auto' } },
    ]
  } };
}

test('fails closed before network without an explicit server-held read token', async () => {
  let networkCalls = 0;
  await assert.rejects(inspectGrafana({ uid: UID, token: '', fetchImpl: () => { networkCalls++; } }), /BLOCKED_READ_TOKEN_NOT_CONFIGURED/);
  assert.equal(networkCalls, 0);
});

test('restricts target to fixed HTTPS host, exact UID and GET with no redirects', async () => {
  const result = await inspectGrafana({
    uid: UID, expectedProjectRef: EXPECTED, token: 'read-only-fixture',
    fetchImpl: mockFetch(dashboard(), { check: (url, options) => {
      assert.equal(url, 'https://charmingpeacock2261.grafana.net/api/dashboards/uid/' + UID);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer read-only-fixture');
    } }),
  });
  assert.equal(result.status, 'DASHBOARD_CONFIG_INSPECTED');
  assert.equal(result.projectStatus, 'PROJECT_MATCH');
  assert.deepEqual(result.targets.map((target) => target.configuredMetric), [true, true]);
  assert.equal(result.providerMutationAuthorized, false);
  assert.equal(result.browserVerified, false);
  assert.equal(result.metricsVerified, false);
  assert.equal(JSON.stringify(result).includes('read-only-fixture'), false);
});

test('does not silently equate StoryEngine project with observed Grafana project', async () => {
  const result = await inspectGrafana({
    uid: UID, expectedProjectRef: STORYENGINE, token: 'read-only-fixture',
    fetchImpl: mockFetch(dashboard()),
  });
  assert.equal(result.projectStatus, 'PROJECT_MISMATCH');
});

test('discover mode returns candidate dashboards, not an inferred dashboard target', async () => {
  const result = await inspectGrafana({
    token: 'read-only-fixture', fetchImpl: mockFetch([
      { uid: UID, title: 'Supabase Project', type: 'dash-db' },
      { uid: 'something-else', title: 'Customer Activity', type: 'dash-db' }
    ]),
  });
  assert.equal(result.status, 'NEEDS_EXACT_DASHBOARD_UID');
  assert.equal(result.dashboards.length, 1);
  assert.equal(result.dashboards[0].uid, UID);
  assert.equal(result.metricsVerified, false);
});

test('rejects malicious UIDs, secret header injection and provider errors', async () => {
  await assert.rejects(inspectGrafana({ uid: '../api/admin', token: 'test' }), /BLOCKED_INVALID_DASHBOARD_UID/);
  await assert.rejects(inspectGrafana({ uid: UID, token: 'test\nInjected: true' }), /BLOCKED_READ_TOKEN_NOT_CONFIGURED/);
  await assert.rejects(inspectGrafana({ uid: UID, token: 'test', fetchImpl: mockFetch({}, { status: 403 }) }), /BLOCKED_GRAFANA_HTTP_403/);
});

test('never fabricates healthy replication for missing targets', async () => {
  const empty = dashboard();
  empty.dashboard.panels[0].targets = [];
  const result = await inspectGrafana({
    uid: UID, token: 'test', fetchImpl: mockFetch(empty),
  });
  assert.equal(result.targets[0].configuredMetric, false);
  assert.equal(result.metricsVerified, false);
  assert.equal(result.projectStatus, 'PROJECT_UNVERIFIED');
});
