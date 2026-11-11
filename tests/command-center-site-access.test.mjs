import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMAND_CENTER_SITE_RESOURCE, resolveCommandCenterActor } from '../src/auth/commandCenterSiteAccess.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const config = { issuer: 'https://identity.example/auth/v1', ownerUserId: OWNER, allowedClientIds: ['command-center-site'], now: 1000 };
function token(sub = CUSTOMER, overrides = {}) {
  const payload = {
    iss: config.issuer, aud: 'authenticated', resource: COMMAND_CENTER_SITE_RESOURCE,
    sub, client_id: 'command-center-site', scope: 'openid', exp: 2000, ...overrides,
  };
  return 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.signed';
}
function harness(verified = { id: CUSTOMER, email: 'customer@example.test' }, allow = false) {
  const calls = { verified: 0, founder: 0 };
  return {
    calls,
    verify: async () => { calls.verified++; return verified; },
    founderAllowlisted: async () => { calls.founder++; return allow; },
  };
}

test('a verified customer remains isolated without any founder lookup', async () => {
  const h = harness();
  assert.deepEqual(await resolveCommandCenterActor(token(), config, h.verify, h.founderAllowlisted),
    { role: 'customer', userId: CUSTOMER, clientId: 'command-center-site' });
  assert.equal(h.calls.founder, 0);
});
test('owner requires exact verified account UUID and founder allowlist', async () => {
  const h = harness({ id: OWNER, email: 'Owner@Example.Test' }, true);
  assert.deepEqual(await resolveCommandCenterActor(token(OWNER), config, h.verify, h.founderAllowlisted),
    { role: 'owner', userId: OWNER, clientId: 'command-center-site' });
  assert.equal(h.calls.founder, 1);
  assert.equal(await resolveCommandCenterActor(token(OWNER), config, h.verify, async () => false), null);
});
test('owner-like email never promotes another verified account', async () => {
  const h = harness({ id: CUSTOMER, email: 'Owner@Example.Test' }, true);
  assert.equal((await resolveCommandCenterActor(token(), config, h.verify, h.founderAllowlisted))?.role, 'customer');
  assert.equal(h.calls.founder, 0);
});
test('resource, audience, scope, client, issuer and expiry must match exactly', async () => {
  const bad = [
    { resource: 'https://evil.example' }, { aud: 'other-api' },
    { aud: 'https://evil.example/' + COMMAND_CENTER_SITE_RESOURCE },
    { aud: COMMAND_CENTER_SITE_RESOURCE + '.evil.example' },
    { resource: 'https://evil.example/?redirect=' + COMMAND_CENTER_SITE_RESOURCE },
    { resource: COMMAND_CENTER_SITE_RESOURCE + '/extra' },
    { aud: 'authenticated', resource: 'https://evil.example' },
    { client_id: 'unknown-client' }, { exp: 999 },
    { iss: 'https://evil.example' }, { nbf: 4000 },
  ];
  for (const overrides of bad) {
    const h = harness();
    assert.equal(await resolveCommandCenterActor(token(CUSTOMER, overrides), config, h.verify, h.founderAllowlisted), null);
    assert.equal(h.calls.verified, 0);
  }
});
test('standard Supabase OAuth token without scope/resource is valid for exact registered client only', async () => {
  const h = harness();
  const actor = await resolveCommandCenterActor(token(CUSTOMER, { resource: undefined, scope: undefined }), config, h.verify, h.founderAllowlisted);
  assert.deepEqual(actor, { role: 'customer', userId: CUSTOMER, clientId: 'command-center-site' });
  assert.equal(h.calls.verified, 1);
});
test('rejects forged owner, disabled user, anonymous user, and identity provider outage', async () => {
  assert.equal(await resolveCommandCenterActor(token(OWNER), config, async () => ({ id: CUSTOMER }), async () => true), null);
  assert.equal(await resolveCommandCenterActor(token(), config, async () => null, async () => true), null);
  assert.equal(await resolveCommandCenterActor(token(), config, async () => ({ id: CUSTOMER, is_anonymous: true }), async () => true), null);
  assert.equal(await resolveCommandCenterActor(token(), config, async () => { throw Error('down'); }, async () => true), null);
  assert.equal(await resolveCommandCenterActor(token(OWNER), config, async () => ({ id: OWNER, email: 'owner@example.test' }), async () => { throw Error('down'); }), null);
});
test('missing verified owner configuration and malformed tokens fail closed', async () => {
  const h = harness();
  assert.equal(await resolveCommandCenterActor(token(), { ...config, ownerUserId: '' }, h.verify, h.founderAllowlisted), null);
  for (const bad of ['', 'abc', 'a.b.c', 'a.eyJmb28iOjJ9.z']) {
    assert.equal(await resolveCommandCenterActor(bad, config, h.verify, h.founderAllowlisted), null);
  }
});
