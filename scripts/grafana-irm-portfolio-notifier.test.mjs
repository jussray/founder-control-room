import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAlert, validateWebhookUrl, dispatchAlert } from './grafana-irm-portfolio-notifier.mjs';

const good = { schema: 'fcr/portfolio-actions-audit@v1', state: 'ATTENTION', installationRepositories: 50,
  discoveryComplete: true, items: [{ repository: 'private-secret-project', head: 'some-secret-head' }] };
const url = 'https://oncall-prod-us-central-0.grafana.net/integrations/v1/formatted_webhook/fakeKey123/';

test('payload cannot leak private repository names or raw audit entries', () => {
  const payload = formatAlert(good, 'https://github.com/jussray/founder-control-room/actions/runs/123');
  assert.equal(payload.state, 'alerting');
  assert.equal(payload.alert_uid, 'fcr-portfolio-actions-audit');
  assert.match(payload.message, /50/);
  assert.doesNotMatch(JSON.stringify(payload), /private-secret-project|some-secret-head/);
});

test('observed CI status sends ok but never claims production verification', () => {
  const payload = formatAlert({ ...good, state: 'OBSERVED_CHECKS_ONLY', expectedMinimum: 46,
    items: Array.from({ length: 50 }, () => ({ state: 'OBSERVED_CHECKS_ONLY', archived: false })) });
  assert.equal(payload.state, 'ok');
  assert.match(payload.message, /not production verification/i);
});

test('malformed receipt fails closed', () => {
  for (const receipt of [null, {}, { ...good, schema: 'wrong' },
    { ...good, state: 'FAKE_GREEN' }, { ...good, installationRepositories: -1 },
    { ...good, installationRepositories: 1.2 }]) {
    assert.throws(() => formatAlert(receipt));
  }
});

test('webhook URL constrained to HTTPS Grafana formatted webhook endpoint', () => {
  assert.equal(validateWebhookUrl(url).hostname, 'oncall-prod-us-central-0.grafana.net');
  for (const bad of ['https://evil.example/integrations/v1/formatted_webhook/key/',
    'http://oncall-prod-us-central-0.grafana.net/integrations/v1/formatted_webhook/key/',
    'https://grafana.net.evil.example/integrations/v1/formatted_webhook/key/',
    'https://user:pass@foo.grafana.net/integrations/v1/formatted_webhook/key/',
    'https://foo.grafana.net/integrations/v1/formatted_webhook/key/?token=leak',
    'https://foo.grafana.net/other/key/']) assert.throws(() => validateWebhookUrl(bad));
});

test('disabled bridge performs no network requests and does not claim connected', async () => {
  let called = false;
  const result = await dispatchAlert({ enabled: false, receipt: good, fetchImpl: () => { called = true; } });
  assert.equal(result, 'DISABLED_UNVERIFIED');
  assert.equal(called, false);
});

test('enabled bridge requires token and webhook; sends bounded alert with manual redirects', async () => {
  await assert.rejects(dispatchAlert({ enabled: true, receipt: good, url }), /CONFIGURATION_INCOMPLETE/);
  let observed;
  const result = await dispatchAlert({ enabled: true, receipt: good, url, bearerToken: 'glsa_test_not_real',
    detailsLink: 'https://github.com/jussray/founder-control-room/actions/runs/123',
    fetchImpl: async (_target, options) => { observed = options; return { ok: true, status: 200 }; } });
  assert.equal(result, 'DELIVERED_HTTP_200_ONLY');
  assert.equal(observed.redirect, 'manual');
  assert.equal(observed.headers.Authorization, 'Bearer glsa_test_not_real');
  assert.doesNotMatch(observed.body, /private-secret-project/);
});

test('provider failure or redirect does not claim delivery or leak the secret endpoint', async () => {
  for (const status of [302, 403, 500]) {
    await assert.rejects(dispatchAlert({ enabled: true, receipt: good, url, bearerToken: 'glsa_test',
      fetchImpl: async () => ({ ok: false, status }) }), /GRAFANA_IRM_DELIVERY_UNVERIFIED/);
  }
  await assert.rejects(dispatchAlert({ enabled: true, receipt: good, url, bearerToken: 'glsa_test',
    fetchImpl: async () => { throw new Error('The secret URL is '+url); } }),
    (error) => error.message === 'GRAFANA_IRM_DELIVERY_UNVERIFIED');
});

test('never auto-resolves from incomplete, contradictory, or stale proof', () => {
  const healthy = { ...good, state: 'OBSERVED_CHECKS_ONLY', expectedMinimum: 46,
    items: Array.from({ length: 50 }, () => ({ state: 'OBSERVED_CHECKS_ONLY', archived: false })) };
  assert.equal(formatAlert(healthy).state, 'ok');
  for (const untrustworthy of [
    { ...healthy, discoveryComplete: false },
    { ...healthy, installationRepositories: 40 },
    { ...healthy, expectedMinimum: 51 },
    { ...healthy, items: healthy.items.slice(1) },
    { ...healthy, items: [{ state: 'FAILED_EXACT_HEAD', archived: false }, ...healthy.items.slice(1)] },
    { ...healthy, expectedMinimum: undefined },
  ]) {
    assert.throws(() => formatAlert(untrustworthy), /INCONSISTENT_PORTFOLIO_AUDIT_RECEIPT/);
  }
});

test('BLOCKED receipt without counts still sends alerting, not an ok', () => {
  const payload = formatAlert({ schema: 'fcr/portfolio-actions-audit@v1', state: 'BLOCKED' });
  assert.equal(payload.state, 'alerting');
  assert.match(payload.message, /unknown/);
});
