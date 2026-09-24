import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT = join(REPO_ROOT, 'public');
const RESULTS_ROOT = join(REPO_ROOT, 'test-results', 'fcr-external-user-modules');

const MODULE_URLS = {
  'truth-weaver': 'https://fcr-truth-weaver.lovable.app',
  'truth-compass': 'https://fcr-truth-compass.lovable.app',
  'exact-match': 'https://fcr-exact-match.lovable.app',
};

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
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
if (!address || typeof address === 'string') throw new Error('FCR proof server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;
mkdirSync(RESULTS_ROOT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function proveFcrModuleDoorway() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('[data-fcr-entry]').waitFor({ state: 'visible' });

  const founderModuleEntry = page.locator('[data-founder-start="modules"]');
  if (await founderModuleEntry.count() !== 1) throw new Error('FCR must expose one founder entry to the attached OS modules');
  if (await founderModuleEntry.getAttribute('href') !== '#os-modules') throw new Error('FCR founder module entry must route to #os-modules');

  const moduleCards = page.locator('[data-fcr-os-modules] [data-fcr-os-module]');
  if (await moduleCards.count() !== 3) throw new Error('FCR must expose exactly three attached OS module surfaces');

  for (const [module, expectedUrl] of Object.entries(MODULE_URLS)) {
    const card = page.locator(`[data-fcr-os-module="${module}"]`);
    if (await card.count() !== 1) throw new Error(`FCR missing unique ${module} module card`);
    if (await card.getAttribute('href') !== expectedUrl) throw new Error(`${module} must route to ${expectedUrl}`);
  }

  const boundary = await page.locator('#os-modules').innerText();
  for (const phrase of ['never grants permission', 'merge', 'deploy', 'publish', 'spend']) {
    if (!boundary.toLowerCase().includes(phrase.toLowerCase())) throw new Error(`FCR module authority boundary missing: ${phrase}`);
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) throw new Error(`FCR module doorway has horizontal overflow: ${JSON.stringify(overflow)}`);
  if (browserErrors.length) throw new Error(`FCR module doorway browser errors: ${browserErrors.join(' | ')}`);

  await page.screenshot({ path: join(RESULTS_ROOT, 'fcr-module-doorway.png'), fullPage: true });
  await context.close();
}

async function proveTruthWeaver() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const browserErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(`${message.type()}: ${message.text()}`);
  });

  await page.goto(MODULE_URLS['truth-weaver'], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('[data-fcr-module="truth-weaver"]').waitFor({ state: 'visible', timeout: 30_000 });

  const form = page.locator('[data-external-tester-loop]');
  const fields = form.locator('textarea');
  if (await fields.count() !== 7) throw new Error('Truth Weaver must expose seven external-tester inputs');
  const values = [
    'Invite one outside founder to test the FCR decision workflow.',
    'The public module loads and exposes a bounded tester loop.',
    'A first-time founder may be able to reach a clearer next action without coaching.',
    'The workflow may still be too abstract for someone who does not know our internal vocabulary.',
    'Ask one outside founder to complete the loop without founder coaching.',
    'They complete it and can explain the bounded next test in their own words.',
    'They cannot finish or cannot explain what the receipt means.',
  ];
  for (let index = 0; index < values.length; index += 1) await fields.nth(index).fill(values[index]);

  const beforeSubmit = {
    values: await fields.evaluateAll((nodes) => nodes.map((node) => node.value)),
    form: await form.evaluate((node) => ({
      valid: node.checkValidity(),
      action: node.action,
      method: node.method,
      data: Object.fromEntries(new FormData(node).entries()),
    })),
    buttonDisabled: await page.locator('[data-generate-receipt]').isDisabled(),
    url: page.url(),
  };

  await page.locator('[data-generate-receipt]').click();
  const receipt = page.locator('[data-completion-receipt]');
  try {
    await receipt.waitFor({ state: 'visible', timeout: 8_000 });
  } catch (error) {
    const afterSubmit = {
      url: page.url(),
      body: (await page.locator('body').innerText()).slice(0, 4000),
      localDraft: await page.evaluate(() => window.localStorage.getItem('fcr.truth-weaver.external-tester.v1')),
      browserErrors,
      consoleErrors,
    };
    await page.screenshot({ path: join(RESULTS_ROOT, 'truth-weaver-submit-failure.png'), fullPage: true });
    throw new Error(`Truth Weaver submit did not produce a receipt. before=${JSON.stringify(beforeSubmit)} after=${JSON.stringify(afterSubmit)} cause=${error.message}`);
  }

  const receiptCopy = await receipt.innerText();
  if (!/non-authorizing/i.test(receiptCopy)) throw new Error('Truth Weaver completion receipt must remain non-authorizing');
  if (browserErrors.length) throw new Error(`Truth Weaver browser errors: ${browserErrors.join(' | ')}`);

  await page.screenshot({ path: join(RESULTS_ROOT, 'truth-weaver-completion.png'), fullPage: true });
  await context.close();
}

async function proveTruthCompass() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(MODULE_URLS['truth-compass'], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('[data-fcr-module="truth-compass"]').waitFor({ state: 'visible', timeout: 30_000 });

  const fields = page.locator('[data-external-tester-loop] textarea');
  if (await fields.count() !== 4) throw new Error('Truth Compass must expose four reconciliation inputs');
  await fields.nth(0).fill('The tested module is serving build external-user-proof-1.');
  await fields.nth(1).fill('external-user-proof-1');
  await fields.nth(2).fill('external-user-proof-1');
  await fields.nth(3).fill('Playwright live module witness');
  await page.locator('[data-run-reconciliation]').click();

  const receipt = page.locator('[data-completion-receipt]');
  await receipt.waitFor({ state: 'visible', timeout: 8_000 });
  if (await receipt.getAttribute('data-truth-state') !== 'VERIFIED') throw new Error('Truth Compass exact version plus evidence must produce VERIFIED');
  const receiptCopy = await receipt.innerText();
  if (!/non-authorizing/i.test(receiptCopy)) throw new Error('Truth Compass receipt must remain non-authorizing');
  if (browserErrors.length) throw new Error(`Truth Compass browser errors: ${browserErrors.join(' | ')}`);

  await page.screenshot({ path: join(RESULTS_ROOT, 'truth-compass-completion.png'), fullPage: true });
  await context.close();
}

async function proveExactMatch() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(MODULE_URLS['exact-match'], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByText(/External tester loop/i).first().waitFor({ state: 'visible', timeout: 30_000 });
  const copy = await page.locator('body').innerText();
  if (!/FCR/i.test(copy) || !/Exact Match Engine/i.test(copy)) throw new Error('Exact Match Engine must retain visible FCR module identity');
  if (!/receipt/i.test(copy)) throw new Error('Exact Match Engine must expose receipt-oriented completion copy');

  await page.screenshot({ path: join(RESULTS_ROOT, 'exact-match-module.png'), fullPage: true });
  await context.close();
}

try {
  await proveFcrModuleDoorway();
  await proveTruthWeaver();
  await proveTruthCompass();
  await proveExactMatch();
  console.log('PASS: FCR exposes three attached OS modules; Truth Weaver and Truth Compass complete real browser workflows and produce non-authorizing receipts; Exact Match retains FCR module identity.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
