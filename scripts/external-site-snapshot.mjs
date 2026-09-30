#!/usr/bin/env node
// External site snapshot: read-only Playwright evidence for a public URL.
// No secrets, no cookies, no founder bearer. Produces screenshots + report.json.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|192\.0\.0\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.|0\.0\.0\.0|.*\.(local|internal|localdomain))/i;
const SOURCE_META_NAMES = new Set(['git-sha', 'commit-sha', 'source-sha', 'build-sha', 'version']);

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

export function sanitizePublishedUrl(raw, base) {
  try {
    const url = new URL(String(raw), base);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return String(raw ?? '').slice(0, 300);
  }
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

  const outRoot = process.env.SNAPSHOT_OUT_DIR || 'snapshots';
  const dir = join(outRoot, snapshotDirName(target.host));
  mkdirSync(dir, { recursive: true });

  const capturedAt = new Date().toISOString();
  const report = {
    schema: 'juss/external-site-snapshot@v2',
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
      queryOrFragmentRedacted: /[?#]/.test(target.url),
    },
    capturedAt,
    viewports: {},
    captureStatus: 'UNKNOWN',
    proofBoundary: {
      runtimeReadback: 'UNKNOWN',
      repositoryToRuntimeEquivalence: 'UNKNOWN',
      note: 'A successful browser capture proves only that the public runtime was observed at capture time. It does not prove that runtime content came from the collector repository or commit unless the runtime independently exposes matching source identity.',
    },
  };

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const requestFailures = [];

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
      const response = await page.goto(target.url, { waitUntil: 'load', timeout: 45_000 });
      status = response ? response.status() : null;
      if (response) {
        const headers = response.headers();
        for (const key of ['content-type', 'cache-control', 'etag', 'last-modified', 'cf-ray', 'server']) {
          if (headers[key]) safeResponseHeaders[key] = String(headers[key]).slice(0, 300);
        }
      }
      await page.waitForTimeout(1500);
    } catch (error) {
      report.viewports[vp.name] = { error: String(error).slice(0, 300) };
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
        bodyTextHead: document.body.innerText.slice(0, 4000),
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
      bodyTextHead: facts.bodyTextHead,
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
  if (collectorSha && observedHints.length > 0) {
    report.proofBoundary.repositoryToRuntimeEquivalence = observedHints.includes(collectorSha) ? 'MATCH' : 'MISMATCH';
  }

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
