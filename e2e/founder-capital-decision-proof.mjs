import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 8814;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FOUNDER_EMAIL = 'founder@example.com';
const BRIDGE_FILE = new URL('./.capital-auth-bridge.json', import.meta.url).pathname;
const REPO_ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));

if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok — ${message}`);
  } else {
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

  console.log('\n[capital-1] Anonymous founder boundary');
  const anonymous = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await anonymous.goto(`${BASE_URL}/control-room/capital-decision.html`, { waitUntil: 'networkidle' });
  assert(
    (await anonymous.locator('.signin h1').innerText()) === 'Founder session required.',
    'capital decision screen does not render the form without a founder session',
  );
  assert((await anonymous.locator('#capital-form').count()) === 0, 'anonymous browser cannot reach capital inputs');
  await anonymous.close();

  console.log('\n[capital-2] Real founder sign-in');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const jsErrors = [];
  page.on('pageerror', (error) => jsErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      jsErrors.push(message.text());
    }
  });

  await page.goto(`${BASE_URL}/control-room/`);
  await page.waitForSelector('#magic-link-form');
  await page.fill('#magic-link-form input[name="email"]', FOUNDER_EMAIL);
  await page.click('#magic-link-form button[type="submit"]');
  const bridge = await waitForBridge();
  assert(Boolean(bridge?.tokenHash), 'server generated the founder magic-link token hash');

  await page.goto(`${BASE_URL}/auth/callback?token_hash=${bridge.tokenHash}`);
  await page.waitForSelector('.topbar');
  assert(
    (await page.locator('.founder-email').innerText()) === FOUNDER_EMAIL,
    'founder session landed on the real Control Room shell',
  );

  console.log('\n[capital-3] Discover the Capital Decision screen through the existing Capabilities surface');
  await page.goto(`${BASE_URL}/control-room/capabilities.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('a[href="/control-room/capital-decision.html"]');
  await page.click('a[href="/control-room/capital-decision.html"]');
  await page.waitForSelector('#capital-form');
  assert(
    (await page.locator('.hero h1').innerText()).includes('Capital should buy proof'),
    'capital decision card is reachable from the founder-facing UI',
  );

  console.log('\n[capital-4] Evaluate a verified constrained-optionality case');
  await page.fill('input[name="decisionId"]', 'seed-round-1');
  await page.fill('input[name="projectId"]', 'founder-control-room');
  await page.fill('input[name="legalEntityId"]', 'juss-labs-llc');
  await page.fill('input[name="capitalLaneId"]', 'seed');
  await page.fill('input[name="milestoneUnlocked"]', 'Prove 100 paying customers');
  await page.fill('input[name="nextFinancingTrigger"]', 'Raise again only after 100 paying customers and 30% repeat');
  await page.fill('input[name="preMoneyDollars"]', '10000000');
  await page.fill('input[name="raiseAmountDollars"]', '3000000');
  await page.fill('input[name="expectedRunwayMonths"]', '12');
  await page.fill('input[name="maxDilutionPct"]', '25');
  await page.fill('input[name="maxEvidenceAgeDays"]', '30');
  await page.fill('input[name="observedAt"]', '2026-09-06T19:00');
  await page.fill('input[name="asOf"]', '2026-09-06T20:00');
  await page.selectOption('select[name="classification"]', 'VERIFIED');
  await page.fill('input[name="instrument"]', 'SAFE');
  await page.fill('textarea[name="evidenceRefs"]', 'evidence:term-sheet-draft');
  await page.fill('textarea[name="optionsBefore"]', '80M strategic exit\nremain independent');
  await page.fill('textarea[name="optionsAfter"]', 'remain independent');
  await page.check('input[name="economicRightsKnown"]');
  await page.check('input[name="controlRightsKnown"]');
  await page.click('#capital-form button[type="submit"]');
  await page.waitForSelector('[data-capital-decision-card]');

  const cardText = await page.locator('[data-capital-decision-card]').innerText();
  assert(cardText.includes('23.08%'), 'real browser shows the Attack-1000-derived dilution');
  assert(cardText.includes('CONSTRAINED'), 'real browser classifies the future option set as CONSTRAINED');
  assert(cardText.includes('80M strategic exit'), 'weakened future option is named instead of hidden in a score');
  assert(cardText.includes('HOLD'), 'focused preview holds because broader Attack 3000 evidence is not supplied');
  assert(cardText.includes('No financing authority granted'), 'browser keeps fundraise/spend/contact authority false');

  mkdirSync(join(REPO_ROOT, 'test-results'), { recursive: true });
  await page.screenshot({
    path: join(REPO_ROOT, 'test-results', 'founder-capital-decision-desktop.png'),
    fullPage: true,
  });

  console.log('\n[capital-5] Mobile layout and stale-evidence fail-closed behavior');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'capital decision screen has no document-level horizontal overflow on mobile',
  );
  await page.screenshot({
    path: join(REPO_ROOT, 'test-results', 'founder-capital-decision-mobile.png'),
    fullPage: true,
  });

  await page.fill('input[name="observedAt"]', '2026-07-01T00:00');
  await page.click('#capital-form button[type="submit"]');
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-capital-decision-card]');
    return card?.textContent?.includes('pre_money:stale_evidence');
  });
  const staleCardText = await page.locator('[data-capital-decision-card]').innerText();
  assert(staleCardText.includes('Unavailable'), 'stale evidence removes derived dilution instead of leaving a false number');
  assert(staleCardText.includes('pre_money:stale_evidence'), 'stale pre-money evidence is founder-visible');
  assert(staleCardText.includes('raise_amount:stale_evidence'), 'stale raise evidence is founder-visible');
  assert(staleCardText.includes('HOLD'), 'stale evidence holds the decision');
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

if (failures > 0) {
  throw new Error(`Founder capital decision Playwright proof failed with ${failures} assertion(s)`);
}

console.log('\nFounder capital decision Playwright proof passed.');
