#!/usr/bin/env node
// External site snapshot: read-only Playwright evidence for a public URL.
// No secrets, no cookies, no founder bearer. Produces screenshots + report.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|192\.0\.0\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.|0\.0\.0\.0|.*\.(local|internal|localdomain))/i;

export function validateTargetUrl(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { return { ok: false, reason: 'not a URL' }; }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https only' };
  if (url.username || url.password) return { ok: false, reason: 'credentials in URL are not allowed' };
  if (url.hostname.startsWith('[')) return { ok: false, reason: 'IP literals are not allowed' };
  if (/^\d+(\.\d+){3}$/.test(url.hostname) || /^\d+$/.test(url.hostname)) return { ok: false, reason: 'IP literals are not allowed' };
  if (PRIVATE_HOST.test(url.hostname)) return { ok: false, reason: 'private or local host' };
  if (!url.hostname.includes('.')) return { ok: false, reason: 'bare hostname' };
  return { ok: true, url: url.toString(), host: url.hostname };
}

// Returns true only for addresses that are globally routable. Covers IPv4
// private/reserved/CGNAT/link-local/multicast ranges and IPv6 loopback, unique-local,
// link-local, multicast, and IPv4-mapped forms of the same.
export function isPublicAddress(ip) {
  const v = String(ip).toLowerCase();
  const family = isIP(v);
  if (family === 4) {
    const [a, b] = v.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0) || b === 88)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    return true;
  }
  if (family === 6) {
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (v === '::' || v === '::1') return false;
    if (/^f[cd]/.test(v)) return false; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(v)) return false; // fe80::/10 link-local
    if (/^ff/.test(v)) return false; // multicast
    return true;
  }
  return false;
}

// Resolves a hostname and requires every returned address to be public.
// `lookupFn` is injectable for tests; production uses the system resolver.
export async function resolvePublicHost(hostname, lookupFn = dnsLookup) {
  if (isIP(hostname)) return { ok: false, reason: 'IP literal' };
  let addresses;
  try {
    addresses = await lookupFn(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: 'DNS resolution failed' };
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return { ok: false, reason: 'no DNS answers' };
  const bad = addresses.find((a) => !isPublicAddress(a.address));
  if (bad) return { ok: false, reason: 'resolves to non-public address' };
  return { ok: true };
}

// Applies to every request the browser makes, including redirect hops and
// sub-resources. Literal URL checks run first; DNS is checked for each hostname.
export async function checkRequestUrl(raw, lookupFn = dnsLookup) {
  const literal = validateTargetUrl(raw);
  if (!literal.ok) return literal;
  const dns = await resolvePublicHost(literal.host, lookupFn);
  if (!dns.ok) return { ok: false, reason: dns.reason };
  return { ok: true, url: literal.url, host: literal.host };
}

// Walks the top-level redirect chain one hop at a time with redirect:'manual', so every
// Location is validated before anything follows it. Returns the validated final URL the
// browser should navigate to. Limits: sub-resource redirects and DNS rebinding between this
// check and the browser connection are not covered here (see the URLFIX contract).
// RFC 6265 5.1.4 default-path: the directory of the request path, or '/'.
export function defaultCookiePath(requestUrl) {
  let path = '/';
  try { path = new URL(requestUrl).pathname; } catch { return '/'; }
  if (!path.startsWith('/')) return '/';
  const last = path.lastIndexOf('/');
  return last <= 0 ? '/' : path.slice(0, last);
}

// Parses one Set-Cookie line. Domain is deliberately ignored so scope stays host-bound.
// Without a Path attribute the cookie is scoped to the response URL's directory, as a browser would.
// Expiry follows RFC 6265 5.2.1-5.2.2 and 5.3: Max-Age wins over Expires; a past or zero
// lifetime marks the cookie expired. expiresAt is epoch seconds, or undefined for a session cookie.
export function parseSetCookie(raw, requestUrl, nowMs = Date.now()) {
  const [pair, ...attrs] = String(raw).split(';').map((x) => x.trim());
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const cookie = { name: pair.slice(0, eq), value: pair.slice(eq + 1), path: defaultCookiePath(requestUrl), secure: false, httpOnly: false, expired: false, expiresAt: undefined };
  let maxAge;
  let expiresMs;
  for (const a of attrs) {
    const [k, ...rest] = a.split('=');
    const key = k.trim().toLowerCase();
    const val = rest.join('=').trim();
    if (key === 'path' && val.startsWith('/')) cookie.path = val;
    else if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'secure') cookie.secure = true;
    else if (key === 'max-age' && /^-?\d+$/.test(val)) maxAge = Number(val);
    else if (key === 'expires') {
      const t = Date.parse(val);
      if (!Number.isNaN(t)) expiresMs = t;
    }
  }
  if (maxAge !== undefined) {
    if (maxAge <= 0) cookie.expired = true;
    else cookie.expiresAt = Math.floor(nowMs / 1000) + maxAge;
  } else if (expiresMs !== undefined) {
    if (expiresMs <= nowMs) cookie.expired = true;
    else cookie.expiresAt = Math.floor(expiresMs / 1000);
  }
  return cookie;
}

// RFC 6265 5.1.4 path-match: exact, or a prefix that ends at a '/' boundary.
export function cookiePathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

// Cookie header for the next validated hop: host-only, path-prefix, and Secure-aware.
function cookieHeaderFor(jar, host, urlString) {
  const { pathname, protocol } = new URL(urlString);
  const isSecure = protocol === 'https:';
  const pairs = [];
  for (const c of jar.values()) {
    if (c.host !== host) continue;
    if (c.secure && !isSecure) continue;
    if (!cookiePathMatches(pathname, c.path)) continue;
    if (c.expiresAt !== undefined && c.expiresAt * 1000 <= Date.now()) continue;
    pairs.push(c);
  }
  // RFC 6265 5.4 step 2: longer paths first; the stable sort keeps creation order for ties.
  pairs.sort((a, b) => b.path.length - a.path.length);
  return pairs.map((c) => `${c.name}=${c.value}`).join('; ');
}

// Walks the top-level redirect chain one hop at a time with redirect:'manual', so every
// Location is validated before anything follows it. Cookies set by validated hops are sent
// back to later validated hops on the same host (the way a browser navigation would), and
// the final jar is returned for seeding the browser context. Limits: sub-resource redirects
// and DNS rebinding between this check and the browser connection are not covered here.
export async function walkRedirects(startUrl, { fetchFn = fetch, lookupFn = dnsLookup, maxHops = 5 } = {}) {
  let current = startUrl;
  const hops = [];
  const jar = new Map(); // key host|path|name -> { host, name, value, path, secure, httpOnly }
  const finalCookies = () => [...jar.values()];
  for (let i = 0; i <= maxHops; i++) {
    const verdict = await checkRequestUrl(current, lookupFn);
    if (!verdict.ok) return { ok: false, reason: verdict.reason, hops, cookies: finalCookies() };
    hops.push(verdict.url);
    const cookieHeader = cookieHeaderFor(jar, verdict.host, verdict.url);
    let res;
    try {
      res = await fetchFn(verdict.url, {
        redirect: 'manual',
        method: 'GET',
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return { ok: false, reason: 'hop request failed', hops, cookies: finalCookies() };
    }
    // Keep Set-Cookie from every validated hop. Values are held in memory only.
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const parsed = parseSetCookie(raw, verdict.url);
      if (!parsed) continue;
      const key = `${verdict.host}|${parsed.path}|${parsed.name}`;
      if (parsed.expired) jar.delete(key);
      else jar.set(key, { ...parsed, host: verdict.host });
    }
    try { await res.body?.cancel(); } catch { /* ignore */ }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { ok: true, finalUrl: verdict.url, hops, cookies: finalCookies() };
      current = new URL(location, verdict.url).toString();
      continue;
    }
    return { ok: true, finalUrl: verdict.url, hops, cookies: finalCookies() };
  }
  return { ok: false, reason: 'too many redirects', hops, cookies: finalCookies() };
}

// Converts Set-Cookie lines from the validated walk into Playwright cookie objects.
// Host-only cookies are bound to the hop host. A Domain attribute is ignored on purpose:
// it could widen scope beyond the validated host. Expired cookies are dropped.
export function cookiesFromWalk(walk) {
  // walk.cookies is already the final jar: expired cookies were removed during the walk.
  return (walk.cookies || []).map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.host,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    ...(c.expiresAt !== undefined ? { expires: c.expiresAt } : {}),
  }));
}

export function snapshotDirName(host, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
  return `${stamp}-${host.replace(/[^a-z0-9.-]/gi, '_')}`;
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'tablet', width: 834, height: 1112, mobile: true },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

async function run() {
  const target = validateTargetUrl(process.env.SNAPSHOT_TARGET_URL);
  if (!target.ok) {
    console.error(`::error title=Invalid target::${target.reason}`);
    process.exit(2);
  }
  const walk = await walkRedirects(target.url);
  if (!walk.ok) {
    console.error(`::error title=BLOCKED destination::${walk.reason}`);
    process.exit(2);
  }
  const navigateUrl = walk.finalUrl;
  const carriedCookies = cookiesFromWalk(walk);
  const outRoot = process.env.SNAPSHOT_OUT_DIR || 'snapshots';
  const dir = join(outRoot, snapshotDirName(target.host));
  mkdirSync(dir, { recursive: true });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const report = { target: target.url, capturedAt: new Date().toISOString(), viewports: {} };
  const blockedDestinations = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
    // Destination guard: every request, redirect hop and sub-resource must pass the
    // literal + DNS public-address check. Failures abort the request (fail closed).
    await context.route('**/*', async (route) => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) return route.continue();
      const verdict = await checkRequestUrl(reqUrl);
      if (!verdict.ok) {
        blockedDestinations.push(`${verdict.reason}`);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    if (carriedCookies.length) await context.addCookies(carriedCookies);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${String(e).slice(0, 300)}`));
    let status = null;
    try {
      const res = await page.goto(navigateUrl, { waitUntil: 'load', timeout: 45_000 });
      status = res ? res.status() : null;
      await page.waitForTimeout(1500);
    } catch (error) {
      report.viewports[vp.name] = { error: String(error).slice(0, 300) };
      await context.close();
      continue;
    }
    const facts = await page.evaluate(() => ({
      title: document.title,
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().slice(0, 120)),
      h2: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim().slice(0, 120)),
      navLinks: [...document.querySelectorAll('nav a[href]')].map((a) => ({ text: a.textContent.trim().slice(0, 60), href: a.getAttribute('href') })),
      externalLinks: [...document.querySelectorAll('a[href^="http"]')].map((a) => a.getAttribute('href')).slice(0, 60),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src).slice(0, 20),
      bodyTextHead: document.body.innerText.slice(0, 4000),
    }));
    await page.screenshot({ path: join(dir, `${vp.name}-viewport.png`) });
    await page.screenshot({ path: join(dir, `${vp.name}-full.png`), fullPage: true });
    report.viewports[vp.name] = { status, ...facts, consoleErrors };
    await context.close();
  }
  await browser.close();
  report.blockedDestinations = [...new Set(blockedDestinations)];
  report.redirectHops = walk.hops;
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  const captured = Object.values(report.viewports).filter((v) => !v.error).length;
  if (captured === 0) {
    console.error(`::error title=No viewport captured::all ${VIEWPORTS.length} viewports failed; see ${dir}/report.json`);
    process.exit(3);
  }
  console.log(`snapshot written to ${dir} (${captured}/${VIEWPORTS.length} viewports)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((error) => { console.error(error); process.exit(1); });
}
