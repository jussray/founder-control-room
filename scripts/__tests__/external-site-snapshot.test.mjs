import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTargetUrl, snapshotDirName } from '../external-site-snapshot.mjs';

test('accepts a public https URL', () => {
  const r = validateTargetUrl('https://juss-and-co.p9s5nbwqyt.chatgpt.site');
  assert.equal(r.ok, true);
  assert.equal(r.host, 'juss-and-co.p9s5nbwqyt.chatgpt.site');
});

test('rejects http, credentials, private and bare hosts, garbage', () => {
  for (const bad of ['http://example.com', 'https://user:pw@example.com', 'https://localhost:8787', 'https://127.0.0.1', 'https://10.0.0.5', 'https://192.168.1.1', 'https://172.16.0.1', 'https://intranet', 'https://api.internal', 'https://169.254.169.254', 'https://100.64.0.1', 'https://[::1]', 'https://[2001:db8::1]', 'https://8.8.8.8', 'not a url']) {
    assert.equal(validateTargetUrl(bad).ok, false, bad);
  }
});

test('snapshot dir name is timestamped and host-safe', () => {
  const name = snapshotDirName('a.b/c', new Date('2026-09-30T06:30:00.000Z'));
  assert.match(name, /^2026-09-30T06-30-00-a\.b_c$/);
});

import { isPublicAddress, resolvePublicHost, checkRequestUrl } from '../external-site-snapshot.mjs';

test('classifies IPv4 and IPv6 addresses as public or non-public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.31.9.9', '192.168.0.1', '169.254.1.1', '100.64.0.1', '198.18.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test('DNS guard rejects a hostname that resolves to any private address', async () => {
  const mixed = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }];
  assert.equal((await resolvePublicHost('rebind.example.com', mixed)).ok, false);
  const failing = async () => { throw new Error('ENOTFOUND'); };
  assert.equal((await resolvePublicHost('missing.example.com', failing)).ok, false);
  const publicOnly = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await resolvePublicHost('example.com', publicOnly)).ok, true);
});

test('request guard blocks literal and DNS-private destinations for redirects and sub-resources', async () => {
  const privateDns = async () => [{ address: '127.0.0.1', family: 4 }];
  assert.equal((await checkRequestUrl('https://metadata.example.com/latest', privateDns)).ok, false);
  assert.equal((await checkRequestUrl('http://example.com/redirect', privateDns)).ok, false);
  const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await checkRequestUrl('https://example.com/ok', publicDns)).ok, true);
});

import { walkRedirects, cookiesFromWalk } from '../external-site-snapshot.mjs';

function fakeFetch(routes) {
  return async (url) => {
    const r = routes[url];
    if (!r) throw new Error(`no route for ${url}`);
    return { status: r.status, headers: { get: (k) => (r.location && k === 'location' ? r.location : null), getSetCookie: () => r.setCookie || [] }, body: null };
  };
}
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('redirect walker follows a public chain and stops at the validated final URL', async () => {
  const fetchFn = fakeFetch({
    'https://start.example.com/': { status: 301, location: 'https://www.example.com/' },
    'https://www.example.com/': { status: 200 },
  });
  const r = await walkRedirects('https://start.example.com/', { fetchFn, lookupFn: publicLookup });
  assert.equal(r.ok, true);
  assert.equal(r.finalUrl, 'https://www.example.com/');
  assert.deepEqual(r.hops, ['https://start.example.com/', 'https://www.example.com/']);
});

test('redirect walker blocks a chain that hops into a private destination before fetching it', async () => {
  let fetched = [];
  const fetchFn = async (url) => {
    fetched.push(url);
    if (url === 'https://start.example.com/') return { status: 302, headers: { get: (k) => (k === 'location' ? 'http://127.0.0.1:8080/admin' : null) }, body: null };
    throw new Error(`must not fetch ${url}`);
  };
  const r = await walkRedirects('https://start.example.com/', { fetchFn, lookupFn: publicLookup });
  assert.equal(r.ok, false);
  assert.deepEqual(fetched, ['https://start.example.com/']);
});

test('redirect walker fails closed on a redirect loop', async () => {
  const fetchFn = async () => ({ status: 302, headers: { get: () => 'https://loop.example.com/' }, body: null });
  const r = await walkRedirects('https://loop.example.com/', { fetchFn, lookupFn: publicLookup, maxHops: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too many redirects');
});

test('a cookie-dependent same-host hop is followed only because the walk sent the earlier hop cookie back', async () => {
  const seen = [];
  const gateFetch = (sameHost) => async (url, init) => {
    seen.push({ url, cookie: init?.headers?.cookie ?? null });
    if (url === 'https://start.example.com/') return { status: 302, headers: { get: () => (sameHost ? 'https://start.example.com/gate' : 'https://www.example.com/gate'), getSetCookie: () => ['token=xyz; Path=/; Secure'] }, body: null };
    if (url === 'https://start.example.com/gate' || url === 'https://www.example.com/gate') {
      const ok = init?.headers?.cookie?.includes('token=xyz');
      return ok
        ? { status: 302, headers: { get: () => `${new URL(url).origin}/app`, getSetCookie: () => [] }, body: null }
        : { status: 403, headers: { get: () => null, getSetCookie: () => [] }, body: null };
    }
    if (url.endsWith('/app')) return { status: 200, headers: { get: () => null, getSetCookie: () => [] }, body: null };
    throw new Error(`unexpected ${url}`);
  };
  // Same host: the cookie is sent, the gate passes, the walk reaches /app.
  const same = await walkRedirects('https://start.example.com/', { fetchFn: gateFetch(true), lookupFn: publicLookup });
  assert.equal(same.ok, true);
  assert.equal(same.finalUrl, 'https://start.example.com/app');
  assert.equal(seen.find((s) => s.url === 'https://start.example.com/gate').cookie, 'token=xyz');
  // Other host: the host-bound cookie is not sent, the gate refuses, the walk stops there.
  seen.length = 0;
  const cross = await walkRedirects('https://start.example.com/', { fetchFn: gateFetch(false), lookupFn: publicLookup });
  assert.equal(cross.ok, true);
  assert.equal(cross.finalUrl, 'https://www.example.com/gate');
  assert.equal(seen.find((s) => s.url === 'https://www.example.com/gate').cookie, null);
});

test('the walk sends a same-host cookie to the next hop and drops it once expired', async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, cookie: init?.headers?.cookie ?? null });
    if (url === 'https://a.example.com/') return { status: 302, headers: { get: () => 'https://a.example.com/b', getSetCookie: () => ['sid=1; Path=/'] }, body: null };
    if (url === 'https://a.example.com/b') return { status: 302, headers: { get: () => 'https://a.example.com/c', getSetCookie: () => ['sid=; Max-Age=0; Path=/'] }, body: null };
    return { status: 200, headers: { get: () => null, getSetCookie: () => [] }, body: null };
  };
  const walk = await walkRedirects('https://a.example.com/', { fetchFn, lookupFn: publicLookup });
  assert.equal(walk.ok, true);
  assert.equal(seen[1].cookie, 'sid=1');
  // Hop c follows the Max-Age=0 clear from hop b, so no cookie is sent.
  assert.equal(seen[2].cookie, null);
  assert.equal(cookiesFromWalk(walk).find((c) => c.name === 'sid'), undefined);
});

test('redirect cookies from validated hops are carried into the browser context without widening scope', async () => {
  const fetchFn = fakeFetch({
    'https://start.example.com/': { status: 302, location: 'https://www.example.com/', setCookie: ['session=abc123; Path=/; Secure; HttpOnly; Domain=example.com'] },
    'https://www.example.com/': { status: 200, setCookie: ['routing=eu; Max-Age=0', 'lang=en; Path=/app'] },
  });
  const walk = await walkRedirects('https://start.example.com/', { fetchFn, lookupFn: publicLookup });
  assert.equal(walk.ok, true);
  const cookies = cookiesFromWalk(walk);
  const session = cookies.find((c) => c.name === 'session');
  assert.deepEqual(session, { name: 'session', value: 'abc123', domain: 'start.example.com', path: '/', secure: true, httpOnly: true });
  assert.equal(cookies.find((c) => c.name === 'routing'), undefined);
  assert.equal(cookies.find((c) => c.name === 'lang').domain, 'www.example.com');
  assert.equal(cookies.every((c) => c.domain !== 'example.com'), true);
});

import { parseSetCookie, defaultCookiePath } from '../external-site-snapshot.mjs';

test('a cookie without Path is scoped to the response directory, not the whole host', async () => {
  assert.equal(defaultCookiePath('https://example.com/account/start'), '/account');
  assert.equal(defaultCookiePath('https://example.com/start'), '/');
  assert.equal(defaultCookiePath('https://example.com/'), '/');
  assert.equal(parseSetCookie('sid=1', 'https://example.com/account/start').path, '/account');
  assert.equal(parseSetCookie('sid=1; Path=/', 'https://example.com/account/start').path, '/');
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, cookie: init?.headers?.cookie ?? null });
    if (url === 'https://a.example.com/account/start') return { status: 302, headers: { get: () => 'https://a.example.com/public', getSetCookie: () => ['sid=1'] }, body: null };
    return { status: 200, headers: { get: () => null, getSetCookie: () => [] }, body: null };
  };
  const walk = await walkRedirects('https://a.example.com/account/start', { fetchFn, lookupFn: publicLookup });
  assert.equal(walk.ok, true);
  assert.equal(seen[1].cookie, null);
  assert.equal(cookiesFromWalk(walk).find((c) => c.name === 'sid').path, '/account');
});

import { cookiePathMatches } from '../external-site-snapshot.mjs';

test('cookie paths match only at directory boundaries', async () => {
  assert.equal(cookiePathMatches('/account', '/account'), true);
  assert.equal(cookiePathMatches('/account/x', '/account'), true);
  assert.equal(cookiePathMatches('/accounting', '/account'), false);
  assert.equal(cookiePathMatches('/anything', '/'), true);
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, cookie: init?.headers?.cookie ?? null });
    if (url === 'https://a.example.com/account/start') return { status: 302, headers: { get: () => 'https://a.example.com/accounting', getSetCookie: () => ['sid=1; Path=/account'] }, body: null };
    return { status: 200, headers: { get: () => null, getSetCookie: () => [] }, body: null };
  };
  const walk = await walkRedirects('https://a.example.com/account/start', { fetchFn, lookupFn: publicLookup });
  assert.equal(walk.ok, true);
  assert.equal(seen[1].cookie, null);
});

test('Expires drops a cookie like Max-Age does, and Max-Age wins over Expires', async () => {
  const now = Date.parse('2026-11-12T00:00:00Z');
  assert.equal(parseSetCookie('sid=old; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/', 'https://a.example.com/', now).expired, true);
  const future = parseSetCookie('sid=1; Expires=Fri, 01 Jan 2100 00:00:00 GMT', 'https://a.example.com/', now);
  assert.equal(future.expired, false);
  assert.equal(future.expiresAt, Date.parse('2100-01-01T00:00:00Z') / 1000);
  assert.equal(parseSetCookie('sid=1; Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'https://a.example.com/', now).expired, false);
  assert.equal(parseSetCookie('sid=1; Max-Age=0; Expires=Fri, 01 Jan 2100 00:00:00 GMT', 'https://a.example.com/', now).expired, true);
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, cookie: init?.headers?.cookie ?? null });
    if (url === 'https://a.example.com/') return { status: 302, headers: { get: () => 'https://a.example.com/b', getSetCookie: () => ['sid=1; Path=/'] }, body: null };
    if (url === 'https://a.example.com/b') return { status: 302, headers: { get: () => 'https://a.example.com/c', getSetCookie: () => ['sid=old; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/'] }, body: null };
    return { status: 200, headers: { get: () => null, getSetCookie: () => [] }, body: null };
  };
  const walk = await walkRedirects('https://a.example.com/', { fetchFn, lookupFn: publicLookup });
  assert.equal(seen[2].cookie, null);
  assert.equal(cookiesFromWalk(walk).find((c) => c.name === 'sid'), undefined);
});

test('same-name cookies are sent most specific path first, as a browser orders them', async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, cookie: init?.headers?.cookie ?? null });
    if (url === 'https://a.example.com/') return { status: 302, headers: { get: () => 'https://a.example.com/account/step', getSetCookie: () => ['sid=root; Path=/'] }, body: null };
    if (url === 'https://a.example.com/account/step') return { status: 302, headers: { get: () => 'https://a.example.com/account/final', getSetCookie: () => ['sid=account; Path=/account'] }, body: null };
    return { status: 200, headers: { get: () => null, getSetCookie: () => [] }, body: null };
  };
  const walk = await walkRedirects('https://a.example.com/', { fetchFn, lookupFn: publicLookup });
  assert.equal(walk.ok, true);
  assert.equal(seen[2].cookie, 'sid=account; sid=root');
});

import { resolveRedirect } from '../external-site-snapshot.mjs';

test('a redirect without a fragment keeps the original fragment; an explicit one replaces it', async () => {
  assert.equal(resolveRedirect('https://www.example.com/', 'https://example.com/#/checkout'), 'https://www.example.com/#/checkout');
  assert.equal(resolveRedirect('/next#/cart', 'https://example.com/#/checkout'), 'https://example.com/next#/cart');
  assert.equal(resolveRedirect('/next#', 'https://example.com/#/checkout'), 'https://example.com/next#');
  const fetchFn = fakeFetch({
    'https://example.com/#/checkout': { status: 301, location: 'https://www.example.com/' },
    'https://www.example.com/#/checkout': { status: 200 },
  });
  const walk = await walkRedirects('https://example.com/#/checkout', { fetchFn, lookupFn: publicLookup });
  assert.equal(walk.ok, true);
  assert.equal(walk.finalUrl, 'https://www.example.com/#/checkout');
});
