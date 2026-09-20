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
if (!address || typeof address === 'string') throw new Error('Static proof server did not bind');
const BASE_URL = `http://127.0.0.1:${address.port}`;
mkdirSync(RESULTS_ROOT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(`${label}: horizontal overflow detected ${JSON.stringify(overflow)}`);
  }
}

async function provePublicFrontDoor(label, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.locator('[data-fcr-entry]').waitFor({ state: 'visible' });

  const publicViews = page.locator('.public-dual > .view-card');
  if (await publicViews.count() !== 2) {
    throw new Error(`${label}: live public domain must render exactly two primary FCR views`);
  }
  if (await page.locator('.public-dual > .user-view').count() !== 1
      || await page.locator('.public-dual > .founder-view').count() !== 1) {
    throw new Error(`${label}: public domain must render one User View and one Founder View`);
  }
  const founderPreviewCopy = await page.locator('.public-dual > .founder-view').innerText();
  if (!founderPreviewCopy.includes('Existing product paths')
      || !founderPreviewCopy.includes('/control-room/')) {
    throw new Error(`${label}: Founder View must explain the real authenticated backend path`);
  }

  const entryChoices = page.locator('[data-entry-choice]');
  if (await entryChoices.count() !== 2) {
    throw new Error(`${label}: public front door must expose exactly two role choices`);
  }

  const userChoice = page.locator('[data-entry-choice="user"]');
  const founderChoice = page.locator('[data-entry-choice="founder"]');
  if (await userChoice.getAttribute('href') !== '#discover') {
    throw new Error(`${label}: user entry must route to the public user onboarding screen`);
  }
  if (await founderChoice.getAttribute('href') !== '#founder-start') {
    throw new Error(`${label}: founder entry must route to founder onboarding`);
  }

  const authenticatedEntryCount = await page.getByRole('link', { name: /Enter authenticated Control Room/i }).count();
  if (authenticatedEntryCount !== 1) {
    throw new Error(`${label}: public site must keep exactly one explicit authenticated Control Room entry`);
  }

  await userChoice.click();
  if (new URL(page.url()).hash !== '#discover') {
    throw new Error(`${label}: user entry did not land on #discover`);
  }
  const userOnboarding = page.locator('[data-public-onboarding="user"]');
  const userCopy = await userOnboarding.innerText();
  if (!/No account is required to explore the public FCR world/i.test(userCopy)) {
    throw new Error(`${label}: user onboarding must make the current public/no-account boundary explicit`);
  }
  if (await userOnboarding.locator('[data-user-start]').count() !== 4) {
    throw new Error(`${label}: user onboarding must expose four real public starting lanes`);
  }
  if (await userOnboarding.locator('[data-user-start="founders"]').getAttribute('href') !== '/work.html') {
    throw new Error(`${label}: founder discovery must route to the real public work directory`);
  }

  await page.goto(`${BASE_URL}/#founder-start`, { waitUntil: 'networkidle' });
  const founderOnboarding = page.locator('[data-public-onboarding="founder"]');
  await founderOnboarding.waitFor({ state: 'visible' });
  const founderCopy = await founderOnboarding.innerText();
  if (!/General member authentication and multi-tenant founder workspaces remain a separate implementation gate/i.test(founderCopy)) {
    throw new Error(`${label}: public founder onboarding must not pretend general multi-tenant founder auth is live`);
  }
  if (!/Connection never creates authority by itself/i.test(founderCopy)) {
    throw new Error(`${label}: founder onboarding must preserve the authority boundary`);
  }
  const founderStart = founderOnboarding.locator('[data-founder-start="authenticated"]');
  if (await founderStart.getAttribute('href') !== '/control-room/') {
    throw new Error(`${label}: founder onboarding must reuse the existing authenticated Control Room path`);
  }

  await assertNoHorizontalOverflow(page, `${label} public front door`);
  await userChoice.focus().catch(() => undefined);
  if (pageErrors.length > 0) throw new Error(`${label}: public browser errors: ${pageErrors.join(' | ')}`);

  await page.screenshot({
    path: join(RESULTS_ROOT, `public-fcr-entry-${label}.png`),
    fullPage: true,
  });

  await context.close();
}

async function proveViewport(label, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/control-room/founder-shell.html`, { waitUntil: 'networkidle' });
  await page.locator('[data-fcr-experience]').waitFor({ state: 'visible' });

  const signatureRootCount = await page.locator('[data-fcr-signature="cinematic-proof-v1"]').count();
  if (signatureRootCount !== 1) {
    throw new Error(`${label}: FCR cinematic-proof visual signature missing or duplicated`);
  }

  const signatureCopy = await page.locator('[data-signature-strip]').innerText();
  if (!signatureCopy.includes('Same mission. Bigger impact.') || !signatureCopy.includes('A brighter tomorrow.')) {
    throw new Error(`${label}: FCR signature phrases drifted: ${signatureCopy}`);
  }

  const viewCount = await page.locator('[data-account-view]').count();
  if (viewCount !== 3) throw new Error(`${label}: expected exactly 3 experience views, got ${viewCount}`);

  const memberCount = await page.locator('[data-account-class="member"]').count();
  const ownerCount = await page.locator('[data-account-class="owner"]').count();
  if (memberCount !== 2 || ownerCount !== 1) {
    throw new Error(`${label}: account classes drifted; member=${memberCount}, owner=${ownerCount}`);
  }

  for (const view of ['user', 'founder', 'fcr-owner']) {
    const count = await page.locator(`[data-account-view="${view}"]`).count();
    if (count !== 1) throw new Error(`${label}: missing unique ${view} view`);
  }

  const crownCount = await page.locator('.view-brand.crown').count();
  if (crownCount !== 1) {
    throw new Error(`${label}: crown must remain owner-only visual authority; found ${crownCount}`);
  }

  const bipCard = page.locator('[data-account-view="user"] .platform-strip').getByText('Se’kret Bip').locator('..');
  if (!(await bipCard.innerText()).includes('Platform')) {
    throw new Error(`${label}: Se’kret Bip must be classified as a Platform in the user view`);
  }

  const founderCopy = await page.locator('[data-account-view="founder"]').innerText();
  if (!founderCopy.includes('never inherits the FCR owner’s portfolio authority')) {
    throw new Error(`${label}: regular founder view must deny owner-authority inheritance`);
  }

  const ownerCard = page.locator('[data-account-view="fcr-owner"]');
  const ownerCopy = await ownerCard.innerText();
  if (!ownerCopy.includes('Founder-gated') && !ownerCopy.includes('founder-gated')) {
    throw new Error(`${label}: owner view must retain founder-gated authority copy`);
  }
  const ownerHref = await ownerCard.locator('.owner-cta').getAttribute('href');
  if (ownerHref !== '/control-room/') {
    throw new Error(`${label}: owner CTA must route to the authenticated Control Room; got ${ownerHref}`);
  }

  const truthNote = await page.locator('.truth-note').innerText();
  if (!truthNote.includes('General member authentication and founder multi-tenancy are an explicit future implementation gate')) {
    throw new Error(`${label}: visual shell must not pretend member auth is already live`);
  }

  await assertNoHorizontalOverflow(page, label);

  await page.locator('.brand').focus();
  const focusOutline = await page.locator('.brand').evaluate((node) => getComputedStyle(node).outlineStyle);
  if (focusOutline === 'none') throw new Error(`${label}: keyboard focus outline missing on primary navigation`);

  if (pageErrors.length > 0) throw new Error(`${label}: browser errors: ${pageErrors.join(' | ')}`);

  await page.screenshot({
    path: join(RESULTS_ROOT, `founder-experience-shell-${label}.png`),
    fullPage: true,
  });

  await context.close();
}

try {
  await provePublicFrontDoor('desktop-1440', { width: 1440, height: 1100 });
  await provePublicFrontDoor('mobile-390', { width: 390, height: 844 });
  await proveViewport('desktop-1440', { width: 1440, height: 1100 });
  await proveViewport('mobile-390', { width: 390, height: 844 });
  console.log('PASS: live public FCR User/Founder dual view, honest onboarding boundaries, FCR visual signature, user/founder/owner views, owner-only crown authority, Bip platform identity, responsive layout, and keyboard focus are preserved.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
