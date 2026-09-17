import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 8821;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FOUNDER_EMAIL = 'founder@example.com';
const E2E_SESSION_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const BRIDGE_FILE = new URL('./.truth-console-auth-bridge.json', import.meta.url).pathname;
const REPO_ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const TRUTH_TABS = [
  'truth-dashboard',
  'truth-claims',
  'truth-evidence',
  'truth-reconcile',
  'truth-attacks',
  'truth-world',
  'truth-continuity',
];

if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  ok — ${message}`);
  else {
    failures += 1;
    console.error(`  FAIL — ${message}`);
  }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Server at ${url} did not become healthy in time`);
}

async function waitForBridge() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (existsSync(BRIDGE_FILE)) return JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
    await sleep(50);
  }
  throw new Error('Magic-link auth bridge did not appear');
}

async function openTruthTab(page, tab) {
  const selector = `.tabs button[data-tab="${tab}"]`;
  await page.waitForSelector(selector);
  await page.click(selector);
  await page.waitForSelector(`[data-truth-screen="${tab}"]`);
}

async function waitForReceipt(page, text) {
  await page.waitForFunction((needle) => {
    const node = document.querySelector('[data-truth-operation-receipt]');
    return node?.textContent?.includes(needle);
  }, text);
  return page.locator('[data-truth-operation-receipt]').innerText();
}

const server = spawn(
  process.execPath,
  [
    '--import',
    new URL('./register-loader.mjs', import.meta.url).pathname,
    new URL('../dist/index.js', import.meta.url).pathname,
  ],
  {
    env: {
      ...process.env,
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
      SUPABASE_PUBLISHABLE_KEY: 'fake-publishable-key',
      FOUNDER_EMAIL,
      E2E_SEED_FOUNDER_EMAIL: FOUNDER_EMAIL,
      E2E_AUTH_BRIDGE_FILE: BRIDGE_FILE,
      FOUNDER_SESSION_ENCRYPTION_KEY: E2E_SESSION_ENCRYPTION_KEY,
      PORT: String(PORT),
      NODE_ENV: 'development',
      FOUNDER_API_URL: BASE_URL,
      FOUNDER_ALLOWED_ORIGINS: BASE_URL,
      GITHUB_TOKEN: 'fake-github-token',
      GITHUB_API_BASE_URL: 'http://127.0.0.1:9',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

let browser;
try {
  await waitForServer(`${BASE_URL}/health`);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const jsErrors = [];
  page.on('pageerror', (error) => jsErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) jsErrors.push(message.text());
  });

  console.log('\n[truth-1] Founder sign-in is required and completed through the real UI');
  await page.goto(`${BASE_URL}/control-room/`);
  await page.waitForSelector('#magic-link-form');
  await page.fill('#magic-link-form input[name="email"]', FOUNDER_EMAIL);
  await page.click('#magic-link-form button[type="submit"]');
  const bridge = await waitForBridge();
  assert(Boolean(bridge?.tokenHash), 'server generated a real founder magic-link token hash');
  await page.goto(`${BASE_URL}/auth/callback?token_hash=${bridge.tokenHash}`);
  await page.waitForSelector('.topbar');
  assert((await page.locator('.founder-email').innerText()) === FOUNDER_EMAIL, 'founder landed in the signed-in Control Room shell');

  console.log('\n[truth-2] Canonical GitHub project identity is registered before truth work');
  await page.goto(`${BASE_URL}/control-room/`);
  await page.waitForSelector('#new-project-form');
  await page.fill('#new-project-form input[name="slug"]', 'demo-project');
  await page.fill('#new-project-form input[name="name"]', 'Demo Project');
  await page.fill('#new-project-form input[name="repoIdentifier"]', 'jussray/demo-project');
  await page.click('#new-project-form button[type="submit"]');
  await page.waitForSelector('#project-list .card');
  assert((await page.locator('#project-list .card').innerText()).includes('Demo Project'), 'project registry persisted the truth scope');

  console.log('\n[truth-3] Dashboard exposes canonical repository scope');
  await openTruthTab(page, 'truth-dashboard');
  const dashboardText = await page.locator('[data-truth-screen="truth-dashboard"]').innerText();
  assert(dashboardText.includes('github:jussray/demo-project'), 'dashboard binds the project to its canonical GitHub repository identity');
  assert(dashboardText.includes('authority effect · none'), 'truth dashboard makes the non-authorizing boundary visible');

  console.log('\n[truth-4] Create a founder claim through the Claims screen');
  await openTruthTab(page, 'truth-claims');
  await page.fill('#truth-create-claim textarea[name="statement"]', 'The signed-in truth console preserves proof continuity without granting authority.');
  await page.click('#truth-create-claim button[type="submit"]');
  const claimReceipt = await waitForReceipt(page, 'Claim created');
  assert(claimReceipt.includes('github:jussray/demo-project'), 'claim receipt preserves canonical repository scope');
  assert(claimReceipt.toLowerCase().includes('unknown'), 'new claim remains unknown instead of becoming green by creation');

  console.log('\n[truth-5] Attach real normalized evidence and preserve the mutation receipt');
  await openTruthTab(page, 'truth-evidence');
  await page.fill('#truth-attach-evidence input[name="detailsRef"]', 'e2e://truth-console/signed-in-browser-proof');
  await page.click('#truth-attach-evidence button[type="submit"]');
  const evidenceReceipt = await waitForReceipt(page, 'Evidence attached');
  assert(evidenceReceipt.includes('claim revision'), 'evidence receipt survives the list rerender');
  assert(evidenceReceipt.includes('authority effect') && evidenceReceipt.includes('none'), 'evidence receipt remains non-authorizing');

  console.log('\n[truth-6] Reconcile exact current revision into receipt + current proof cookie');
  await openTruthTab(page, 'truth-reconcile');
  await page.click('[data-reconcile]');
  const reconcileReceipt = await waitForReceipt(page, 'Reconciliation committed');
  assert(reconcileReceipt.includes('fcr-proof-v1:'), 'reconciliation exposes the continuity proof cookie after rerender');
  assert(reconcileReceipt.toLowerCase().includes('current'), 'fresh reconciliation cookie is current');
  assert(reconcileReceipt.includes('authority effect') && reconcileReceipt.includes('none'), 'reconciliation cannot create authority');
  mkdirSync(join(REPO_ROOT, 'test-results'), { recursive: true });
  await page.screenshot({ path: join(REPO_ROOT, 'test-results', 'truth-console-reconciliation.png'), fullPage: true });

  console.log('\n[truth-7] Open and resolve an attack only with evidence linked to that claim');
  await openTruthTab(page, 'truth-attacks');
  await page.fill('#truth-create-attack textarea[name="challenge"]', 'Does the current browser evidence still support this claim after an adversarial version challenge?');
  await page.selectOption('#truth-create-attack select[name="attackType"]', 'version');
  await page.selectOption('#truth-create-attack select[name="severity"]', 'high');
  await page.click('#truth-create-attack button[type="submit"]');
  await waitForReceipt(page, 'Attack opened');
  await page.waitForSelector('.truth-resolve-attack');
  assert((await page.locator('.truth-resolve-attack select[name="evidenceId"] option').count()) === 1, 'attack resolution offers only evidence actually linked to the challenged claim');
  await page.fill('.truth-resolve-attack textarea[name="answer"]', 'The linked signed-in browser receipt answers this version challenge, but it invalidates the previous continuity cookie before any fresh reconciliation.');
  const resolveButton = page.locator('.truth-resolve-attack button[type="submit"]');
  const launchDock = page.locator('.launch-dock');
  const [buttonBox, dockBox] = await Promise.all([resolveButton.boundingBox(), launchDock.boundingBox()]);
  const dockOverlapsResolve = Boolean(buttonBox && dockBox
    && buttonBox.x < dockBox.x + dockBox.width
    && buttonBox.x + buttonBox.width > dockBox.x
    && buttonBox.y < dockBox.y + dockBox.height
    && buttonBox.y + buttonBox.height > dockBox.y);
  assert(!dockOverlapsResolve, 'collapsed founder stack dock does not cover the attack-resolution action');
  await resolveButton.click();
  const attackReceipt = await waitForReceipt(page, 'Attack resolved');
  assert(attackReceipt.toLowerCase().includes('stale'), 'attack resolution leaves the prior cookie visibly stale');
  assert(attackReceipt.includes('authority effect') && attackReceipt.includes('none'), 'attack resolution cannot create authority');

  console.log('\n[truth-8] Continuity page shows the stale cookie and exact invalidation reason');
  await openTruthTab(page, 'truth-continuity');
  const continuityText = await page.locator('[data-truth-screen="truth-continuity"]').innerText();
  assert(continuityText.toLowerCase().includes('stale'), 'continuity page shows stale state after attack resolution');
  assert(continuityText.includes('attack_resolution_changed_truth'), 'continuity page names the exact invalidation cause');

  console.log('\n[truth-9] World Radar refuses synthetic rows when no persisted intelligence exists');
  await openTruthTab(page, 'truth-world');
  const worldText = await page.locator('[data-truth-screen="truth-world"]').innerText();
  assert(worldText.includes('No persisted world-radar records yet.'), 'world radar renders a truthful empty state instead of fixtures');

  console.log('\n[truth-10] Dashboard reflects the completed walk');
  await openTruthTab(page, 'truth-dashboard');
  const finalDashboardText = await page.locator('[data-truth-screen="truth-dashboard"]').innerText();
  assert(finalDashboardText.includes('Stale cookies'), 'dashboard includes continuity aging after the attack');
  assert(finalDashboardText.includes('Open attacks'), 'dashboard includes attack state');
  await page.screenshot({ path: join(REPO_ROOT, 'test-results', 'truth-console-dashboard.png'), fullPage: true });

  console.log('\n[truth-11] All seven signed-in screens remain usable without document overflow on mobile');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of TRUTH_TABS) {
    await openTruthTab(page, tab);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${tab} avoids document-level horizontal overflow`,
    );
  }
  await openTruthTab(page, 'truth-attacks');
  await page.screenshot({ path: join(REPO_ROOT, 'test-results', 'truth-console-mobile.png'), fullPage: true });

  assert(jsErrors.length === 0, `no uncaught browser JavaScript errors (saw ${JSON.stringify(jsErrors)})`);
  await page.close();
} catch (error) {
  failures += 1;
  console.error(error);
  console.error('\n--- server log ---\n' + serverLog.slice(-12_000));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
  if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);
}

if (failures > 0) throw new Error(`Truth console Playwright proof failed with ${failures} assertion(s)`);
console.log('\nTruth console signed-in seven-screen Playwright proof passed.');
