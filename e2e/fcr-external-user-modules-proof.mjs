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

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(`${label} has horizontal overflow: ${JSON.stringify(overflow)}`);
  }
}

async function proveFcrModuleDoorway() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('[data-fcr-entry]').waitFor({ state: 'visible' });

  const entryChoices = page.locator('[data-entry-choice]');
  if (await entryChoices.count() !== 2) throw new Error('FCR public front door must expose exactly two primary choices');
  if (await page.locator('[data-entry-choice="user"]').count() !== 1) throw new Error('FCR public front door must expose one User view');
  if (await page.locator('[data-entry-choice="founder"]').count() !== 1) throw new Error('FCR public front door must expose one Founder view');

  const founderOnboarding = page.locator('#founder-start');
  if (await founderOnboarding.count() !== 1) throw new Error('FCR must retain the founder onboarding surface');

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

  await assertNoHorizontalOverflow(page, 'FCR module doorway desktop');
  if (browserErrors.length) throw new Error(`FCR module doorway browser errors: ${browserErrors.join(' | ')}`);

  await page.screenshot({ path: join(RESULTS_ROOT, 'fcr-module-doorway.png'), fullPage: true });
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobile.locator('[data-fcr-entry]').waitFor({ state: 'visible' });
  if (await mobile.locator('[data-entry-choice]').count() !== 2) throw new Error('FCR mobile front door lost User/Founder choices');
  if (await mobile.locator('[data-fcr-os-modules] [data-fcr-os-module]').count() !== 3) throw new Error('FCR mobile layout lost attached OS modules');
  await assertNoHorizontalOverflow(mobile, 'FCR module doorway mobile');
  await mobile.screenshot({ path: join(RESULTS_ROOT, 'fcr-module-doorway-mobile.png'), fullPage: true });
  await mobileContext.close();
}

async function proveTruthWeaver() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const browserErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${message.type()}: ${message.text()}`);
  });

  await page.goto(MODULE_URLS['truth-weaver'], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('[data-fcr-module="truth-weaver"]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('heading', { name: /Understand the law/i }).waitFor({ state: 'visible', timeout: 15_000 });

  const bodyCopy = await page.locator('body').innerText();
  for (const phrase of ['Counsel', 'Legal Areas', 'Truth Weaver', 'FCR Control Plane', 'Commerce Surface', 'Authority ceiling']) {
    if (!bodyCopy.toLowerCase().includes(phrase.toLowerCase())) throw new Error(`Truth Weaver approved screen direction missing: ${phrase}`);
  }
  if (/guaranteed legal advice|guaranteed outcome|verified lawyer/i.test(bodyCopy)) throw new Error('Truth Weaver must not manufacture legal authority or guaranteed outcomes');

  const legalAreaCards = page.locator('#legal-areas a');
  if (await legalAreaCards.count() !== 11) throw new Error(`Truth Weaver must expose the approved 11 legal-area lanes, found ${await legalAreaCards.count()}`);

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

  const localDraft = await page.evaluate(() => window.localStorage.getItem('fcr.truth-weaver.external-tester.v1'));
  if (!localDraft || !localDraft.includes(values[0])) throw new Error('Truth Weaver local-first draft persistence failed');

  await assertNoHorizontalOverflow(page, 'Truth Weaver desktop');
  if (browserErrors.length) throw new Error(`Truth Weaver browser errors: ${browserErrors.join(' | ')}`);
  if (consoleErrors.length) throw new Error(`Truth Weaver console errors: ${consoleErrors.join(' | ')}`);

  await page.screenshot({ path: join(RESULTS_ROOT, 'truth-weaver-completion.png'), fullPage: true });
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto(MODULE_URLS['truth-weaver'], { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await mobile.locator('[data-fcr-module="truth-weaver"]').waitFor({ state: 'visible', timeout: 30_000 });
  await mobile.getByRole('heading', { name: /Understand the law/i }).waitFor({ state: 'visible', timeout: 15_000 });
  await assertNoHorizontalOverflow(mobile, 'Truth Weaver mobile');
  await mobile.screenshot({ path: join(RESULTS_ROOT, 'truth-weaver-mobile.png'), fullPage: true });
  await mobileContext.close();
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
  await assertNoHorizontalOverflow(page, 'Truth Compass desktop');
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
  await assertNoHorizontalOverflow(page, 'Exact Match Engine desktop');

  await page.screenshot({ path: join(RESULTS_ROOT, 'exact-match-module.png'), fullPage: true });
  await context.close();
}

try {
  await proveFcrModuleDoorway();
  await proveTruthWeaver();
  await proveTruthCompass();
  await proveExactMatch();
  console.log('PASS: FCR retains User/Founder entry + onboarding, exposes the three attached OS modules, Truth Weaver matches the approved Counsel direction and completes a local-first non-authorizing workflow on desktop/mobile, Truth Compass reconciles with a non-authorizing receipt, and Exact Match retains FCR identity.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
