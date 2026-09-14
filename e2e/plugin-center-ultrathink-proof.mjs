import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT = join(REPO_ROOT, 'public');
const RESULTS_ROOT = join(REPO_ROOT, 'test-results');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webp': 'image/webp',
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

  if (imageState.src !== '/assets/plugins/ultrathink.webp') {
    throw new Error(`${label}: unexpected ULTRATHINK image path: ${imageState.src}`);
  }
  if (imageState.alt !== 'ULTRATHINK FCR Plugin') {
    throw new Error(`${label}: unexpected ULTRATHINK alt text: ${imageState.alt}`);
  }
  if (!imageState.complete || imageState.naturalWidth <= 0 || imageState.naturalHeight <= 0) {
    throw new Error(`${label}: ULTRATHINK artwork did not decode: ${JSON.stringify(imageState)}`);
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

  await page.screenshot({
    path: join(RESULTS_ROOT, `plugin-center-ultrathink-${label}.png`),
    fullPage: true,
  });

  await context.close();
}

try {
  await proveViewport('desktop-1440', { width: 1440, height: 1100 });
  await proveViewport('mobile-390', { width: 390, height: 844 });
  console.log('PASS: ULTRATHINK Plugin Center artwork, command identity, non-authorizing boundary, responsive layout, and browser asset loading are proven on desktop and mobile.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
