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
  const targetDns = await resolvePublicHost(target.host);
  if (!targetDns.ok) {
    console.error(`::error title=BLOCKED destination::${targetDns.reason}`);
    process.exit(2);
  }
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
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${String(e).slice(0, 300)}`));
    let status = null;
    try {
      const res = await page.goto(target.url, { waitUntil: 'load', timeout: 45_000 });
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
