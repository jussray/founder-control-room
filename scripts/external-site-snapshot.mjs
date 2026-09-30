#!/usr/bin/env node
// External site snapshot: read-only Playwright evidence for a public URL.
// No secrets, no cookies, no founder bearer. Produces screenshots + report.json.
import { mkdirSync, writeFileSync } from 'node:fs';
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
  const outRoot = process.env.SNAPSHOT_OUT_DIR || 'snapshots';
  const dir = join(outRoot, snapshotDirName(target.host));
  mkdirSync(dir, { recursive: true });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const report = { target: target.url, capturedAt: new Date().toISOString(), viewports: {} };
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
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
