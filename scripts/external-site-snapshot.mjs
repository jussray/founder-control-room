#!/usr/bin/env node
// External site snapshot: read-only Playwright evidence for a public URL.
// No user credentials or founder bearer. Only ephemeral public-navigation cookies are carried.
// Produces screenshots + report.json; request guards are not runtime identity attestation.
import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|192\.0\.0\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.|0\.0\.0\.0|.*\.(local|internal|localdomain))/i;
const SOURCE_META_NAMES = new Set(['git-sha', 'commit-sha', 'source-sha', 'build-sha', 'version']);

function privateOrReservedIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function privateOrReservedIpv6(address) {
  const value = address.toLowerCase();
  let canonical;
  try { canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1); } catch { return true; }
  const mapped = canonical.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
  if (mapped) {
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return privateOrReservedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    /^fe[89ab]/.test(value) ||
    value.startsWith('ff') ||
    value.startsWith('2001:db8:') ||
    value === '2001:db8::'
  );
}

export function isPrivateOrReservedAddress(address) {
  const family = isIP(address);
  if (family === 4) return privateOrReservedIpv4(address);
  if (family === 6) return privateOrReservedIpv6(address);
  return true;
}

export function validateTargetUrl(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { return { ok: false, reason: 'not a URL' }; }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https only' };
  if (url.username || url.password) return { ok: false, reason: 'credentials in URL are not allowed' };
  if (url.search || url.hash) return { ok: false, reason: 'query strings and fragments are not allowed for public snapshot publication' };
  if (url.hostname.startsWith('[')) return { ok: false, reason: 'IP literals are not allowed' };
  if (/^\d+(\.\d+){3}$/.test(url.hostname) || /^\d+$/.test(url.hostname)) return { ok: false, reason: 'IP literals are not allowed' };
  if (PRIVATE_HOST.test(url.hostname)) return { ok: false, reason: 'private or local host' };
  if (!url.hostname.includes('.')) return { ok: false, reason: 'bare hostname' };
  return { ok: true, url: url.toString(), host: url.hostname };
}

export async function validatePublicRequestUrl(raw, resolver = dnsLookup) {
  const currentGuard = await checkRequestUrl(raw, resolver);
  if (!currentGuard.ok) return { ok: false, reason: `private or reserved destination: ${currentGuard.reason}` };
  let url;
  try { url = new URL(String(raw)); } catch { return { ok: false, reason: 'invalid request URL' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { ok: true, reason: 'non-network URL' };
  if (url.username || url.password) return { ok: false, reason: 'credentials in request URL are not allowed' };
  if (url.hostname.startsWith('[') || isIP(url.hostname)) return { ok: false, reason: 'IP literal request blocked' };
  if (PRIVATE_HOST.test(url.hostname) || !url.hostname.includes('.')) return { ok: false, reason: 'private or local request host' };

  let records;
  try {
    records = await resolver(url.hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: 'DNS resolution failed' };
  }
  if (!Array.isArray(records) || records.length === 0) return { ok: false, reason: 'DNS returned no addresses' };
  if (records.some((record) => isPrivateOrReservedAddress(record.address))) {
    return { ok: false, reason: 'DNS resolved to a private or reserved address' };
  }
  return { ok: true, reason: 'public network destination' };
}

export function sanitizePublishedUrl(raw, base) {
  try {
    const url = new URL(String(raw), base);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid URL redacted]';
  }
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
    if (privateOrReservedIpv6(v)) return false;
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
  let parsed;
  try { parsed = new URL(String(raw)); } catch { return { ok: false, reason: 'not a URL' }; }
  const networkUrl = new URL(parsed);
  networkUrl.search = '';
  networkUrl.hash = '';
  const literal = validateTargetUrl(networkUrl.toString());
  if (!literal.ok) return literal;
  const dns = await resolvePublicHost(literal.host, lookupFn);
  if (!dns.ok) return { ok: false, reason: dns.reason };
  return { ok: true, url: parsed.toString(), host: literal.host };
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

// RFC 7231 7.1.2: a Location without a fragment inherits the request's fragment, as a browser
// does; an explicit fragment, including an empty '#', replaces it.
export function resolveRedirect(location, fromUrl) {
  const next = new URL(location, fromUrl);
  if (!String(location).includes('#')) next.hash = new URL(fromUrl).hash;
  return next.toString();
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
      current = resolveRedirect(location, verdict.url);
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
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${stamp}-${host.replace(/[^a-z0-9.-]/gi, '_')}`;
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function classifyCaptureStatus(viewports, expectedCount = VIEWPORTS.length) {
  const entries = Object.values(viewports);
  const captured = entries.filter((value) => !value?.error);
  if (captured.length === 0) return 'FAILED';
  const healthy = captured.filter((value) => Number.isInteger(value?.status) && value.status >= 200 && value.status < 400);
  if (captured.length === expectedCount && healthy.length === expectedCount) return 'OBSERVED';
  return 'PARTIAL';
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

  const initialNetworkCheck = await validatePublicRequestUrl(target.url);
  if (!initialNetworkCheck.ok) {
    console.error(`::error title=Unsafe target::${initialNetworkCheck.reason}`);
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

  const capturedAt = new Date().toISOString();
  const report = {
    schema: 'juss/external-site-snapshot@v3',
    collector: {
      repository: process.env.GITHUB_REPOSITORY || null,
      commitSha: process.env.GITHUB_SHA || null,
      ref: process.env.GITHUB_REF || null,
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    target: {
      host: target.host,
      publicUrl: sanitizePublishedUrl(target.url),
      queryOrFragmentAccepted: false,
    },
    capturedAt,
    viewports: {},
    captureStatus: 'UNKNOWN',
    proofBoundary: {
      runtimeReadback: 'UNKNOWN',
      repositoryToRuntimeEquivalence: 'UNKNOWN',
      networkBoundary: 'PUBLIC_DESTINATION_GUARD',
      note: 'A successful browser capture proves only that the public runtime was observed at capture time. It does not prove that runtime content came from the collector repository or commit unless the runtime independently exposes matching source identity.',
    },
  };

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const blockedDestinations = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      serviceWorkers: 'block',
    });
    if (carriedCookies.length) await context.addCookies(carriedCookies);
    const consoleErrors = [];
    const requestFailures = [];

    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      let parsed;
      try { parsed = new URL(requestUrl); } catch {
        requestFailures.push({ url: String(requestUrl).slice(0, 300), reason: 'invalid request URL blocked' });
        await route.abort('blockedbyclient');
        return;
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        await route.continue();
        return;
      }
      const verdict = await validatePublicRequestUrl(requestUrl);
      if (!verdict.ok) {
        blockedDestinations.push(verdict.reason);
        requestFailures.push({ url: sanitizePublishedUrl(requestUrl), reason: verdict.reason });
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });

    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
    });
    page.on('pageerror', (error) => consoleErrors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
    page.on('requestfailed', (request) => {
      requestFailures.push({
        url: sanitizePublishedUrl(request.url()),
        reason: request.failure()?.errorText?.slice(0, 160) || 'request failed',
      });
    });

    let status = null;
    let safeResponseHeaders = {};
    try {
      const response = await page.goto(navigateUrl, { waitUntil: 'load', timeout: 45_000 });
      status = response ? response.status() : null;
      if (response) {
        const headers = response.headers();
        for (const key of ['content-type', 'cache-control', 'etag', 'last-modified', 'cf-ray', 'server']) {
          if (headers[key]) safeResponseHeaders[key] = String(headers[key]).slice(0, 300);
        }
      }
      await page.waitForTimeout(1500);
    } catch (error) {
      report.viewports[vp.name] = { error: String(error).slice(0, 300), requestFailures: requestFailures.slice(0, 30) };
      await context.close();
      continue;
    }

    const facts = await page.evaluate((sourceMetaNames) => {
      const sourceIdentityHints = [...document.querySelectorAll('meta[name]')]
        .filter((meta) => sourceMetaNames.includes(meta.getAttribute('name')?.toLowerCase()))
        .map((meta) => ({
          name: meta.getAttribute('name')?.toLowerCase(),
          content: meta.getAttribute('content')?.trim().slice(0, 160) || '',
        }))
        .filter((entry) => entry.content);

      return {
        title: document.title,
        h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().slice(0, 120)),
        h2: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim().slice(0, 120)),
        navLinks: [...document.querySelectorAll('nav a[href]')].map((a) => ({
          text: a.textContent.trim().slice(0, 60),
          href: a.getAttribute('href'),
        })),
        externalLinks: [...document.querySelectorAll('a[href^="http"]')].map((a) => a.getAttribute('href')).slice(0, 60),
        canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || null,
        sourceIdentityHints,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src).slice(0, 20),
      };
    }, [...SOURCE_META_NAMES]);

    const finalUrl = sanitizePublishedUrl(page.url());
    const documentHtml = await page.content();
    const externalLinks = facts.externalLinks.map((href) => sanitizePublishedUrl(href, page.url()));
    const brokenImages = facts.brokenImages.map((src) => sanitizePublishedUrl(src, page.url()));
    const navLinks = facts.navLinks.map((link) => ({ ...link, href: sanitizePublishedUrl(link.href, page.url()) }));

    await page.screenshot({ path: join(dir, `${vp.name}-viewport.png`) });
    await page.screenshot({ path: join(dir, `${vp.name}-full.png`), fullPage: true });

    report.viewports[vp.name] = {
      status,
      finalUrl,
      responseHeaders: safeResponseHeaders,
      documentSha256: sha256(documentHtml),
      title: facts.title,
      h1: facts.h1,
      h2: facts.h2,
      navLinks,
      externalLinks,
      canonicalUrl: facts.canonicalUrl ? sanitizePublishedUrl(facts.canonicalUrl, page.url()) : null,
      sourceIdentityHints: facts.sourceIdentityHints,
      overflowX: facts.overflowX,
      brokenImages,
      consoleErrors,
      requestFailures: requestFailures.slice(0, 30),
    };

    await context.close();
  }

  await browser.close();

  report.captureStatus = classifyCaptureStatus(report.viewports);
  report.proofBoundary.runtimeReadback = report.captureStatus === 'FAILED' ? 'UNKNOWN' : 'OBSERVED';

  const observedHints = Object.values(report.viewports)
    .flatMap((viewport) => viewport?.sourceIdentityHints || [])
    .map((entry) => entry.content)
    .filter(Boolean);
  const collectorSha = report.collector.commitSha;
  // DOM meta tags are untrusted observations, never repository-qualified attestation.
  report.sourceIdentityHintsMatchCollector = Boolean(collectorSha && observedHints.length > 0
    && observedHints.every((hint) => hint === collectorSha));
  report.proofBoundary.repositoryToRuntimeEquivalence = 'UNKNOWN';

  report.blockedDestinations = [...new Set(blockedDestinations)];
  report.redirectHops = walk.hops;
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));

  if (report.captureStatus === 'FAILED') {
    console.error(`::error title=No viewport captured::all ${VIEWPORTS.length} viewports failed; see ${dir}/report.json`);
    process.exit(3);
  }

  const captured = Object.values(report.viewports).filter((value) => !value?.error).length;
  console.log(`snapshot written to ${dir} (${captured}/${VIEWPORTS.length} viewports, status=${report.captureStatus})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run().catch((error) => { console.error(error); process.exit(1); });
}
