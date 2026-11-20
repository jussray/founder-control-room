import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/_worker.js', import.meta.url), 'utf8');
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const request = (path) => new Request('https://foundercontrolroom.org' + path, {
  headers: { 'user-agent': 'OAI-SearchBot/1.0', 'x-verified-bot': 'true' },
});
const assets = (calls) => ({ fetch: async () => { calls.push('ASSETS'); return new Response('public work'); } });

test('public /work calls Protect Me 2 before ASSETS without trusting client headers', async () => {
  const calls = [];
  const req = request('/work');
  Object.defineProperty(req, 'cf', { value: { botManagement: { verifiedBot: false }, country: 'US' } });
  const res = await handler.fetch(req, {
    ASSETS: assets(calls),
    PROTECT_ME_2_SHIELD: { inspect: async (input) => {
      calls.push('INSPECT');
      assert.equal(input.verifiedBot, false);
      assert.equal(input.pathname, '/work');
      return { schema: 'protect-me/shield-inspection@v1', action: 'pass', receiptKind: 'hmac-sha256', receipt: 'a'.repeat(64) };
    } },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['INSPECT', 'ASSETS']);
});

test('unverified deny cannot block public pages; missing binding preserves routing', async () => {
  for (const inspector of [
    undefined,
    { inspect: async () => ({ schema: 'protect-me/shield-inspection@v1', action: 'deny', receiptKind: 'none', receipt: null }) },
    { inspect: async () => { throw Error('service unavailable'); } },
  ]) {
    const calls = [];
    const res = await handler.fetch(request('/work'), {
      ASSETS: assets(calls),
      ...(inspector ? { PROTECT_ME_2_SHIELD: inspector } : {}),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(calls, ['ASSETS']);
  }
});

test('private API routes and unrelated public assets do not use the new inspector', async () => {
  let inspected = 0;
  const env = {
    ASSETS: assets([]),
    PROTECT_ME_2_SHIELD: { inspect: async () => { inspected++; throw Error('unexpected'); } },
    FCR_API: { fetch: async () => new Response('ok', { headers: { 'x-founder-control-room-service': 'founder-control-room' } }) },
  };
  assert.equal((await handler.fetch(request('/robots.txt'), env)).status, 200);
  assert.equal((await handler.fetch(request('/api/internal'), env)).status, 200);
  assert.equal(inspected, 0);
});

test('stalled inspector is bounded and does not block the public page', async () => {
  const calls = [];
  const start = Date.now();
  const res = await handler.fetch(request('/work'), {
    ASSETS: assets(calls),
    PROTECT_ME_2_SHIELD: { inspect: () => new Promise(() => {}) },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['ASSETS']);
  assert.ok(Date.now() - start < 1500, 'inspection must be bounded');
});
