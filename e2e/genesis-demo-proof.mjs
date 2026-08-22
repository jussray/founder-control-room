import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..');
const pagesRoot = resolve(repositoryRoot, 'dist-pages');
const outputDir = resolve(repositoryRoot, 'test-results/genesis-demo');

execFileSync('npm', ['run', 'build'], { cwd: repositoryRoot, stdio: 'inherit' });
execFileSync('npm', ['run', 'build:pages'], { cwd: repositoryRoot, stdio: 'inherit' });

const moduleUrl = pathToFileURL(resolve(repositoryRoot, 'dist/config/demoPortfolio.js')).href;
const { BIP_GENESIS_DEMO } = await import(`${moduleUrl}?proof=${Date.now()}`);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/control-room/genesis.html' : url.pathname);
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
assert(address && typeof address === 'object', 'Genesis proof server must expose a local port');
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

  const response = await page.goto(`${origin}/control-room/genesis.html`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, `${name}: Genesis page returns 200`);
  await page.locator('[data-testid="genesis-demo"]').waitFor({ state: 'visible' });

  assert.match(await page.title(), /Bip Genesis/i, `${name}: browser title names Genesis`);
  assert.match(await page.locator('[data-testid="authoring-surface"]').innerText(), /ChatGPT @Sites/i, `${name}: authoring surface is explicit`);
  assert.equal(
    (await page.locator('[data-testid="custom-domain"]').innerText()).trim(),
    new URL(BIP_GENESIS_DEMO.historicalCustomDomain).hostname,
    `${name}: custom-domain identity matches the typed provenance contract`,
  );
  assert.match(await page.locator('[data-testid="generated-url"]').innerText(), /not recovered.*unknown/i, `${name}: unknown generated Sites URL stays unknown`);
  assert.equal(
    (await page.locator('[data-testid="canonical-repository"]').innerText()).trim(),
    BIP_GENESIS_DEMO.canonicalRepository,
    `${name}: canonical repository matches the typed provenance contract`,
  );

  const historicalText = await page.locator('[data-testid="historical-demo"]').innerText();
  assert.match(historicalText, new RegExp(BIP_GENESIS_DEMO.historicalDemoRepository.replace('/', '\\/'), 'i'), `${name}: historical demo repository is named`);
  assert.match(historicalText, /quarantined/i, `${name}: historical demo quarantine is visible`);
  assert.match(historicalText, /not canonical/i, `${name}: historical demo cannot masquerade as canonical product`);

  const authorityText = await page.locator('[data-testid="authority-boundary"]').innerText();
  assert.match(authorityText, /demo provenance only/i, `${name}: demo authority boundary is explicit`);
  const controlText = await page.locator('[data-testid="control-layer"]').innerText();
  assert.match(controlText, /does not grant merge, deploy, rollback, secret, or destructive authority/i, `${name}: privileged authority stays denied`);
  const proofBoundary = await page.locator('[data-testid="proof-boundary"]').innerText();
  assert.match(proofBoundary, /does not prove production deployment, user readiness, or safety completion/i, `${name}: production-readiness overclaim is denied`);

  const customHref = await page.locator('[data-testid="custom-domain"]').getAttribute('href');
  assert.equal(customHref, BIP_GENESIS_DEMO.historicalCustomDomain, `${name}: custom-domain link matches provenance`);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${name}: Genesis page has no horizontal overflow`);
  assert.equal(pageErrors.length, 0, `${name}: no page errors`);
  assert.equal(consoleErrors.length, 0, `${name}: no console errors`);

  const screenshot = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  results.push({
    name,
    viewport: { width, height },
    screenshot: `test-results/genesis-demo/${name}.png`,
    pageErrors,
    consoleErrors,
  });
}

try {
  await proveViewport({ name: 'desktop', width: 1440, height: 1000 });
  await proveViewport({ name: 'mobile', width: 390, height: 844, isMobile: true });

  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    result: 'passed',
    contractId: BIP_GENESIS_DEMO.id,
    authorityBoundary: BIP_GENESIS_DEMO.authorityBoundary,
    generatedPlatformUrl: BIP_GENESIS_DEMO.generatedPlatformUrl,
    source: 'public/control-room/genesis.html',
    provenanceSource: 'src/config/demoPortfolio.ts',
    viewports: results,
  };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
  await new Promise((accept) => server.close(accept));
}
