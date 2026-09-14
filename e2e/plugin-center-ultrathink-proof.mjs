import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT = join(REPO_ROOT, 'public');
const RESULTS_ROOT = join(REPO_ROOT, 'test-results');
const DURABLE_RESULTS_ROOT = join(REPO_ROOT, 'logs', 'plugin-center-ultrathink');
const APPROVED_ART_SHA256 = '5802a8fb856b813011851600ed7a6fa764f19141b91742823a584c58deb3e218';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

const pluginCenterPayload = {
  summary: {
    installedConnections: 0,
    activeConnections: 0,
    errorConnections: 0,
    highRiskConnections: 0,
    activeTemporaryGrants: 0,
    missingAuthorityLevel: 0,
  },
  contract: {
    label: 'Founder Control Room Plugin Center',
    purpose: 'Connect tools, gate power, preserve proof.',
    enforcementNote: 'Plugin availability never creates authority.',
    principles: ['Discovery is not authority.', 'Approval remains founder-gated.'],
  },
  connections: [],
  temporaryGrants: [],
  catalog: [],
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (url.pathname === '/plugin-center') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(pluginCenterPayload));
    return;
  }

  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const filePath = normalize(join(PUBLIC_ROOT, relative));

  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Plugin Center proof server did not bind');
const BASE_URL = `http://127.0.0.1:${address.port}`;
mkdirSync(RESULTS_ROOT, { recursive: true });
mkdirSync(DURABLE_RESULTS_ROOT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function proveViewport(label, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  const failedRequests = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'failed'}`));

  await page.goto(`${BASE_URL}/control-room/plugin-center.html`, { waitUntil: 'networkidle' });

  const card = page.locator('[data-plugin-id="ultrathink"]');
  await card.waitFor({ state: 'visible' });

  const title = (await card.locator('.plugin-title').innerText()).trim();
  if (title !== 'ULTRATHINK') throw new Error(`${label}: ULTRATHINK title drifted: ${title}`);

  const copy = await card.innerText();
  for (const required of ['built-in', 'reasoning only', 'non-authorizing', '/ultrathink']) {
    if (!copy.includes(required)) throw new Error(`${label}: missing ULTRATHINK boundary copy: ${required}`);
  }

  const image = card.locator('img.plugin-art');
  const imageState = await image.evaluate((node) => ({
    src: node.getAttribute('src'),
    alt: node.getAttribute('alt'),
    complete: node.complete,
    naturalWidth: node.naturalWidth,
    naturalHeight: node.naturalHeight,
  }));

  if (imageState.src !== '/assets/plugins/ultrathink.svg') {
    throw new Error(`${label}: unexpected ULTRATHINK image path: ${imageState.src}`);
  }
  if (imageState.alt !== 'ULTRATHINK FCR Plugin') {
    throw new Error(`${label}: unexpected ULTRATHINK alt text: ${imageState.alt}`);
  }
  if (!imageState.complete || imageState.naturalWidth <= 0 || imageState.naturalHeight <= 0) {
    throw new Error(`${label}: ULTRATHINK artwork did not decode: ${JSON.stringify(imageState)}`);
  }

  const artwork = await page.evaluate(async () => {
    const response = await fetch('/assets/plugins/ultrathink.svg');
    return { ok: response.ok, contentType: response.headers.get('content-type'), text: await response.text() };
  });
  if (!artwork.ok || !artwork.contentType?.includes('image/svg+xml')) {
    throw new Error(`${label}: ULTRATHINK SVG was not served as an image: ${JSON.stringify({ ok: artwork.ok, contentType: artwork.contentType })}`);
  }

  for (const marker of [
    'data-ultrathink-art="v2-approved-brain"',
    `data-source-sha256="${APPROVED_ART_SHA256}"`,
    'HIGHER INTELLIGENCE',
    'REAL RESULTS',
    'FCR PLUGIN',
  ]) {
    if (!artwork.text.includes(marker)) throw new Error(`${label}: approved ULTRATHINK identity marker is missing: ${marker}`);
  }

  const embeddedMatch = artwork.text.match(/href="data:image\/webp;base64,([^"]+)"/);
  if (!embeddedMatch) throw new Error(`${label}: approved ULTRATHINK WebP payload is missing`);
  const embeddedSha = createHash('sha256').update(Buffer.from(embeddedMatch[1], 'base64')).digest('hex');
  if (embeddedSha !== APPROVED_ART_SHA256) {
    throw new Error(`${label}: ULTRATHINK artwork bytes drifted: expected ${APPROVED_ART_SHA256}, got ${embeddedSha}`);
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(`${label}: horizontal overflow detected ${JSON.stringify(overflow)}`);
  }

  if (pageErrors.length > 0) throw new Error(`${label}: browser errors: ${pageErrors.join(' | ')}`);
  if (failedRequests.length > 0) throw new Error(`${label}: failed requests: ${failedRequests.join(' | ')}`);

  const screenshotName = `plugin-center-ultrathink-${label}.png`;
  const ephemeralPath = join(RESULTS_ROOT, screenshotName);
  const durablePath = join(DURABLE_RESULTS_ROOT, screenshotName);
  await page.screenshot({ path: ephemeralPath, fullPage: true });
  copyFileSync(ephemeralPath, durablePath);

  await context.close();
}

try {
  await proveViewport('desktop-1440', { width: 1440, height: 1100 });
  await proveViewport('mobile-390', { width: 390, height: 844 });
  console.log(`PASS: approved ULTRATHINK artwork ${APPROVED_ART_SHA256}, command identity, non-authorizing boundary, responsive layout, browser asset loading, and durable desktop/mobile screenshot receipts are proven.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
