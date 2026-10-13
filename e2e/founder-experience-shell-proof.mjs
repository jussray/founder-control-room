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

// Internal evidence, identifiers, credentials and personal identity must never be served to the public page.
const PUBLIC_FORBIDDEN = [
  '228', 'cd0e0fe', '20819094', '#769', '#894', '#895', 'deploy token', 'Cloudflare',
  'Deploy:', 'Access gate', 'Johnstown', 'Taylor M', 'Alex R', 'Jordan K', '1.2K', '+42%',
  'Good evening', 'Good morning', 'Juss', 'Raylene',
];

async function provePublicFrontDoor(label, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Check the bytes the public server actually serves, not only the rendered DOM.
  const served = await (await fetch(`${BASE_URL}/`)).text();
  const leaks = PUBLIC_FORBIDDEN.filter((term) => served.includes(term));
  if (leaks.length > 0) {
    throw new Error(`${label}: internal or personal strings served to the public page: ${leaks.join(', ')}`);
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

  const visualSignature = await page.locator('body').getAttribute('data-fcr-visual');
  if (visualSignature !== 'approved-mockup-v3') {
    throw new Error(`${label}: public FCR visual signature drifted: ${visualSignature}`);
  }

  const headline = await page.locator('#home-title').innerText();
  if (!headline.includes('Back Founders') || !headline.includes('Build a Brighter')) {
    throw new Error(`${label}: approved public headline drifted: ${headline}`);
  }

  const tabs = page.getByRole('tab');
  if (await tabs.count() !== 2) throw new Error(`${label}: public FCR must expose exactly two view tabs`);
  const tabLabels = await tabs.allInnerTexts();
  if (!tabLabels[0].includes('User View') || !tabLabels[1].includes('Founder View')) {
    throw new Error(`${label}: view tabs drifted: ${tabLabels.join(' | ')}`);
  }

  const userPanel = page.locator('[data-view-panel="user"]');
  const founderPanel = page.locator('[data-view-panel="founder"]');
  if (!(await userPanel.isVisible()) || (await founderPanel.isVisible())) {
    throw new Error(`${label}: User View must be the default public view; Founder View must start hidden`);
  }

  const userCopy = await userPanel.innerText();
  if (!/No account is required to explore the public FCR world/i.test(userCopy)) {
    throw new Error(`${label}: user view must make the no-account boundary explicit`);
  }
  if (await page.locator('#discover a.btn').getAttribute('href') !== '/work.html') {
    throw new Error(`${label}: public Explore action must route to the real public work directory`);
  }

  await assertNoHorizontalOverflow(page, `${label} user view`);
  await page.screenshot({ path: join(RESULTS_ROOT, `public-fcr-user-${label}.png`), fullPage: true });

  await page.getByRole('tab', { name: 'Founder View' }).click();
  if (!(await founderPanel.isVisible()) || (await userPanel.isVisible())) {
    throw new Error(`${label}: selecting Founder View must show only the founder panel`);
  }
  if (await page.getByRole('tab', { name: 'Founder View' }).getAttribute('aria-selected') !== 'true') {
    throw new Error(`${label}: Founder View tab must report aria-selected=true`);
  }

  const founderCopy = await founderPanel.innerText();
  if (!/Founder access still passes through FCR authentication/i.test(founderCopy)) {
    throw new Error(`${label}: founder view must state that access passes through FCR authentication`);
  }
  if (!/General member authentication and multi-tenant founder workspaces remain a separate implementation gate/i.test(founderCopy)) {
    throw new Error(`${label}: founder view must not pretend general multi-tenant founder auth is live`);
  }
  if (!/Connection never creates authority by itself/i.test(founderCopy)) {
    throw new Error(`${label}: founder view must preserve the connection-is-not-authority boundary`);
  }
  if (!/after founder sign-in/i.test(founderCopy)) {
    throw new Error(`${label}: founder view must gate private project, proof and decision state behind sign-in`);
  }
  const ownerCta = founderPanel.locator('a.owner-cta');
  if (await ownerCta.count() !== 1 || await ownerCta.getAttribute('href') !== '/control-room/') {
    throw new Error(`${label}: founder view must expose exactly one authenticated Control Room entry`);
  }

  await assertNoHorizontalOverflow(page, `${label} founder view`);
  await page.screenshot({ path: join(RESULTS_ROOT, `public-fcr-founder-${label}.png`), fullPage: true });

  const footerCopy = await page.locator('footer').innerText();
  if (!footerCopy.includes('Same truth. Higher outcomes.')) {
    throw new Error(`${label}: canonical FCR visual thesis missing from footer`);
  }

  if (pageErrors.length > 0) throw new Error(`${label}: public browser errors: ${pageErrors.join(' | ')}`);

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
  console.log('PASS: public FCR approved-mockup-v3 tabbed User/Founder views, no internal evidence served publicly, honest sign-in boundary, FCR cinematic signature, user/founder/owner authority classes, owner-only crown authority, Bip platform identity, responsive layout, and keyboard focus are preserved.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
