import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..');
const pagesRoot = resolve(repositoryRoot, 'dist-pages');
const outputDir = resolve(repositoryRoot, 'test-results/evidence-trust-plane');

execFileSync('npm', ['run', 'build:pages'], { cwd: repositoryRoot, stdio: 'inherit' });

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/control-room/evidence-trust.html' : url.pathname);
    const requested = resolve(pagesRoot, `.${pathname}`);
    if (!requested.startsWith(`${pagesRoot}/`) && requested !== pagesRoot) {
      response.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(requested);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(requested);
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(requested)) || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  }
});

await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', accept);
});
const address = server.address();
assert(address && typeof address === 'object', 'Evidence trust proof server must expose a local port');
const origin = `http://127.0.0.1:${address.port}`;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];

async function proveViewport({ name, width, height, isMobile = false }) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const response = await page.goto(`${origin}/control-room/evidence-trust.html`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, `${name}: evidence trust page returns 200`);
  await page.locator('[data-evidence-trust-plane]').waitFor({ state: 'visible' });

  assert.match(await page.title(), /Evidence Trust Plane/i, `${name}: browser title names evidence trust plane`);
  assert.match(await page.locator('[data-evidence-trust-plane]').innerText(), /Observation is not truth\. Truth is not authority\./i, `${name}: core boundary is visible`);
  assert.match(await page.locator('[data-evidence-state="observation"]').innerText(), /Intake pending/i, `${name}: observation stays intake pending`);
  assert.match(await page.locator('[data-evidence-state="verification"]').innerText(), /Provider readback required/i, `${name}: provider verification is visible`);
  assert.match(await page.locator('[data-evidence-state="ledger"]').innerText(), /Persistence required/i, `${name}: ledger requirement is visible without claiming storage is wired`);
  assert.match(await page.locator('[data-evidence-state="validity"]').innerText(), /stale.*superseded.*expired/i, `${name}: freshness states are visible`);

  const bodyText = await page.locator('body').innerText();
  assert.match(bodyText, /durable receipt storage is not wired here/i, `${name}: contract-only persistence boundary is explicit`);
  assert.match(bodyText, /n8n may create intake events and trigger read-only verification/i, `${name}: n8n sensor ceiling is explicit`);
  assert.match(bodyText, /cannot mark evidence verified/i, `${name}: n8n cannot self-promote evidence`);
  assert.match(bodyText, /expected GitHub repository and exact target SHA/i, `${name}: merge-review preparation is visibly target-bound`);
  assert.match(bodyText, /workflow conclusion is success/i, `${name}: verified failure cannot be presented as merge-review-ready`);
  assert.match(bodyText, /no more than 60 minutes/i, `${name}: merge-review freshness lease is visibly duration-bounded`);
  assert.match(bodyText, /Merge · deploy · production promotion · close issue · modify secrets · change policy · delete data/i, `${name}: complete current-receipt action ceiling is visible`);

  assert.equal(await page.getByRole('columnheader', { name: 'Evidence state' }).count(), 1, `${name}: evidence-state column header remains in the accessibility tree`);
  assert.equal(await page.getByRole('columnheader', { name: 'May unlock' }).count(), 1, `${name}: may-unlock column header remains in the accessibility tree`);
  assert.equal(await page.getByRole('columnheader', { name: 'Still blocked' }).count(), 1, `${name}: still-blocked column header remains in the accessibility tree`);

  if (isMobile) {
    const labels = await page.locator('.trust-cell-label').allTextContents();
    assert(labels.includes('Evidence state'), `${name}: stacked rows visibly label evidence state`);
    assert(labels.includes('May unlock'), `${name}: stacked rows visibly label may-unlock values`);
    assert(labels.includes('Still blocked'), `${name}: stacked rows visibly label blocked values`);
    await page.locator('.trust-cell-label').first().waitFor({ state: 'visible' });
  }

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${name}: trust page has no horizontal overflow`);
  assert.equal(pageErrors.length, 0, `${name}: no page errors`);
  assert.equal(consoleErrors.length, 0, `${name}: no console errors`);

  const screenshot = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  results.push({ name, viewport: { width, height }, screenshot: `test-results/evidence-trust-plane/${name}.png`, pageErrors, consoleErrors });
}

try {
  await proveViewport({ name: 'desktop', width: 1440, height: 1000 });
  await proveViewport({ name: 'mobile', width: 390, height: 844, isMobile: true });

  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    result: 'passed',
    source: 'public/control-room/evidence-trust.html',
    authorityBoundary: 'browser rendering proof only; does not authorize merge, deploy, provider mutation, evidence verification, or durable ledger persistence',
    viewports: results,
  };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
  await new Promise((accept) => server.close(accept));
}
