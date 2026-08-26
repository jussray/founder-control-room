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
const outputDir = resolve(repositoryRoot, 'test-results/portfolio-demo');
const expectedHead = process.env.EXPECTED_HEAD_SHA?.trim().toLowerCase() || null;

execFileSync('npm', ['run', 'build:pages'], { cwd: repositoryRoot, stdio: 'inherit' });
const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim().toLowerCase();
if (expectedHead) assert.equal(actualHead, expectedHead, 'portfolio demo proof must run on the exact FCR head');

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/demo/index.html' : url.pathname);
    const requested = resolve(pagesRoot, `.${pathname}`);
    if (!requested.startsWith(`${pagesRoot}/`) && requested !== pagesRoot) {
      response.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(requested);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(requested);
    response.writeHead(200, { 'content-type': mimeTypes.get(extname(requested)) || 'application/octet-stream', 'cache-control': 'no-store' });
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
assert(address && typeof address === 'object', 'portfolio demo proof server must expose a local port');
const origin = `http://127.0.0.1:${address.port}`;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];

async function proveViewport(name, width, height, isMobile = false) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  const response = await page.goto(`${origin}/demo/index.html`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, `${name}: demo page returns 200`);
  await page.getByTestId('portfolio-demo').waitFor({ state: 'visible' });

  assert.match(await page.title(), /See the System/i, `${name}: title names the demo`);
  assert.match(await page.getByTestId('demo-boundary').innerText(), /inspect-only/i, `${name}: inspect-only authority is visible`);
  assert.match(await page.getByTestId('demo-boundary').innerText(), /no privileged writes/i, `${name}: privileged writes are denied`);
  assert.match(await page.getByTestId('demo-boundary').innerText(), /no browser cookie required/i, `${name}: proof-cookie vocabulary does not become browser tracking`);
  assert.equal(await page.locator('script').count(), 0, `${name}: public demo has no client-side script authority`);
  assert.equal(await page.locator('form').count(), 0, `${name}: public demo has no forms`);
  assert.equal(await page.locator('input, textarea, select').count(), 0, `${name}: public demo collects no visitor input`);
  assert.equal(await page.getByTestId('demo-sekret-bip').count(), 1, `${name}: Se’kret Bip demo is present`);
  assert.equal(await page.getByTestId('demo-fcr').count(), 1, `${name}: FCR demo is present`);

  const sekretDemo = page.getByTestId('open-sekret-demo');
  assert.equal(await sekretDemo.getAttribute('href'), null, `${name}: unverified Se’kret Bip live entry is not clickable`);
  assert.equal(await sekretDemo.getAttribute('aria-disabled'), 'true', `${name}: unverified Se’kret Bip entry is explicitly disabled`);
  assert.match(await sekretDemo.innerText(), /witness pending/i, `${name}: withheld live entry explains the proof gate`);

  for (const testId of ['sekret-genesis-withheld', 'fcr-genesis-withheld']) {
    const withheld = page.getByTestId(testId);
    assert.equal(await withheld.getAttribute('href'), null, `${name}: ${testId} cannot route around the Se’kret witness gate`);
    assert.equal(await withheld.getAttribute('aria-disabled'), 'true', `${name}: ${testId} is explicitly disabled`);
    assert.match(await withheld.innerText(), /witness pending/i, `${name}: ${testId} explains why provenance navigation is withheld`);
  }
  assert.equal(await page.locator('a[href="/control-room/genesis.html"]').count(), 0, `${name}: demo exposes no Genesis navigation while Se’kret witness is pending`);
  assert.equal(await page.locator('a[href*="sekretbip.net"]').count(), 0, `${name}: demo exposes no direct Se’kret production-domain link while witness is pending`);

  const claimBoundary = await page.getByTestId('claim-boundary').innerText();
  assert.match(claimBoundary, /does not prove/i, `${name}: overclaim boundary is visible`);
  assert.match(claimBoundary, /current production runtime equals current repository main/i, `${name}: runtime/source equivalence is not invented`);

  const dimensions = await page.evaluate(() => ({ viewportWidth: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${name}: page has no horizontal overflow`);
  assert.equal(pageErrors.length, 0, `${name}: no page errors`);
  assert.equal(consoleErrors.length, 0, `${name}: no console errors`);

  const screenshot = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  results.push({ name, viewport: { width, height }, screenshot: `test-results/portfolio-demo/${name}.png` });
  await context.close();
}

try {
  await proveViewport('desktop', 1440, 1100);
  await proveViewport('mobile', 390, 844, true);
  const receipt = {
    schemaVersion: 1,
    result: 'passed',
    generatedAt: new Date().toISOString(),
    fcrHead: actualHead,
    authorityBoundary: 'public-demo-inspect-only',
    source: 'public/demo/index.html',
    viewports: results,
  };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
  await new Promise((accept) => server.close(accept));
}
