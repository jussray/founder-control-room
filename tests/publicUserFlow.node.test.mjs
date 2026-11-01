import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(new URL(path, 'file://' + root.replace(/\/$/, '') + '/'), 'utf8');

test('customer entry is visible from the public homepage, not the founder sign-in', () => {
  const home = read('public/index.html');
  assert.match(home, /href="\/account\/"[^>]*>[^<]*?(?:Get started|Create your workspace|Customer access)/i);
  assert.match(home, /No account is required to explore the public FCR world/i);
  assert.match(home, /href="\/control-room\/" aria-label="Founder sign-in"/);
});

test('customer onboarding never claims unverified signup, billing or private access', () => {
  const page = read('public/account/index.html');
  for (const term of ['Explore', 'Choose', 'Account', 'Workspace', 'not yet available', 'No payment is collected']) {
    assert.ok(page.includes(term), 'missing onboarding truth: ' + term);
  }
  assert.match(page, /href="\/work\.html"/);
  assert.doesNotMatch(page, /<form\b|<input\b|<script\b|data:[^" ]+|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(page, /founder-only|founder access/i);
  assert.match(page, /disabled[^>]*aria-disabled="true"|aria-disabled="true"[^>]*disabled/i);
});

test('customer static route stays on Pages, never proxies to the privileged API', () => {
  const worker = read('public/_worker.js');
  assert.match(worker, /STATIC_DIRECTORY_PREFIXES\s*=\s*\[[\s\S]*?'\/account'/);
  const headers = read('public/_headers');
  assert.match(headers, /\/account\/\*[\s\S]*?Cache-Control: no-store/);
});

test('customer GET and HEAD paths never reach the founder API binding', async () => {
  const { default: worker } = await import('../public/_worker.js');
  const fetched = [];
  const env = {
    ASSETS: { fetch: async request => {
      fetched.push(new URL(request.url).pathname);
      return new Response('public customer asset', { status: 200 });
    } },
    FCR_API: { fetch: async () => { throw new Error('founder API must not be contacted'); } },
  };
  for (const path of ['/account', '/account/', '/account/index.html']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request('https://www.foundercontrolroom.org' + path, { method }), env);
      assert.equal(response.status, 200, method + ' ' + path);
    }
  }
  assert.deepEqual(fetched, ['/account','/account','/account/','/account/','/account/index.html','/account/index.html']);
});

test('the Cloudflare Pages build includes customer onboarding as a required asset', () => {
  assert.match(read('scripts/build-pages.mjs'), /'account\/index\.html'/);
});

test('customer API remains on the verified backend and preserves bearer authorization', async () => {
  const { default: worker } = await import('../public/_worker.js');
  const apiCalls = [];
  const env = {
    ASSETS: { fetch: async () => { throw new Error('Customer API must never be served as a public static asset'); } },
    FCR_API: { fetch: async req => {
      apiCalls.push({
        pathname: new URL(req.url).pathname,
        authorization: req.headers.get('authorization'),
        edge: req.headers.get('x-founder-control-room-edge'),
      });
      return new Response('{}', {
        status: 200,
        headers: { 'x-founder-control-room-service': 'founder-control-room' },
      });
    } },
  };
  for (const path of ['/customer/status', '/customer/workspace']) {
    const response = await worker.fetch(new Request('https://www.foundercontrolroom.org' + path, {
      headers: { Authorization: 'Bearer source-test-token' },
    }), env);
    assert.equal(response.status, 200);
  }
  assert.deepEqual(apiCalls, [
    { pathname: '/customer/status', authorization: 'Bearer source-test-token', edge: 'cloudflare-pages' },
    { pathname: '/customer/workspace', authorization: 'Bearer source-test-token', edge: 'cloudflare-pages' },
  ]);
});
