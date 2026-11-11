import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN = 'https://funding-proof.local';
const proofDir = 'test-results/pa-funding';
const fsRoot = new URL('../public/control-room/', import.meta.url);
mkdirSync(proofDir, { recursive: true });

function asset(pathname) {
  const file = pathname.slice('/control-room/'.length);
  if (!['pa-funding.html', 'pa-funding.css', 'pa-funding.js', 'capital-decision.html'].includes(file)) return null;
  return readFileSync(new URL(file, fsRoot), 'utf8');
}

async function wire(page, signedIn) {
  await page.route(ORIGIN + '/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/me') {
      return route.fulfill({
        status: signedIn ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(signedIn
          ? { success: true, data: { founder: { email: 'founder@example.com' } } }
          : { error: 'unauthorized' }),
      });
    }
    const data = asset(url.pathname);
    if (data !== null) {
      const contentType = url.pathname.endsWith('.css') ? 'text/css'
        : url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html';
      return route.fulfill({ status: 200, contentType, body: data });
    }
    return route.fulfill({ status: 404, body: 'not found' });
  });
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
try {
  const anonymous = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await wire(anonymous, false);
  await anonymous.goto(ORIGIN + '/control-room/pa-funding.html', { waitUntil: 'networkidle' });
  await anonymous.locator('.access-denied').waitFor();
  assert.equal(await anonymous.locator('#workspace:visible').count(), 0,
    'anonymous user must not see funding workspace');
  assert.equal(await anonymous.locator('.op-card').count(), 0,
    'no records rendered in signed-out DOM');
  await anonymous.close();

  const context = await browser.newContext({ viewport: { width: 1340, height: 980 } });
  const page = await context.newPage();
  const errors = [];
  const mutationRequests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) mutationRequests.push(request.url());
  });
  await wire(page, true);
  await page.goto(ORIGIN + '/control-room/pa-funding.html', { waitUntil: 'networkidle' });
  await page.locator('#workspace:not([hidden])').waitFor();

  assert.equal(await page.locator('.op-card').count(), 9, 'nine sourced programs/channels');
  assert.equal(await page.locator('#open-count').innerText(), '2',
    'only CEA Growth and Impact have confirmed opening windows');
  assert.equal(await page.locator('button.stage.locked').isDisabled(), true, 'APPLY is locked');
  assert.match(await page.locator('#details').innerText(), /UNKNOWN/, 'applicant eligibility unknown');
  assert.match(await page.locator('#details').innerText(), /Dec 31, 2026/, 'CEA deadline visible');

  await page.locator('button[data-tab="evidence"]').click();
  const officialLink = page.locator('#tab-content a.source-link');
  assert.match(await officialLink.getAttribute('href'), /^https:\/\/www\.pa\.gov\//,
    'evidence points to official PA source');
  await page.locator('button[data-tab="receipt"]').click();
  for (const label of ['REALITY', 'FIX', 'PROOF', 'RISK', 'ROLLBACK', 'NEXT GATE']) {
    assert.ok((await page.locator('#tab-content').innerText()).includes(label), label + ' receipt field');
  }

  await page.locator('button[data-tab="checklist"]').click();
  await page.locator('input[data-check="0"]').check();
  await page.locator('button[data-stage="PREPARE"]').click();
  assert.match(await page.locator('#details').innerText(), /Application readiness\s+UNKNOWN/,
    'prep does not convert UNKNOWN to eligible');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#workspace:not([hidden])').waitFor();
  assert.equal(await page.locator('input[data-check="0"]').isChecked(), true,
    'checklist persists within this browser tab session');
  assert.equal(await page.locator('button[data-stage="PREPARE"]').getAttribute('aria-pressed'), 'true',
    'stage persists within tab session');

  await page.locator('#lane-filter').selectOption('contracts');
  assert.equal(await page.locator('.op-card').count(), 2, 'contract lane filter works');
  await page.locator('#lane-filter').selectOption('all');
  await page.locator('#query').fill('Keystone');
  assert.equal(await page.locator('.op-card').count(), 1, 'search narrows to KIZ');
  await page.locator('#query').fill('');
  await page.locator('button[data-id="kiz"]').click();
  assert.match(await page.locator('#details').innerText(), /geographic gate|precise site/i,
    'KIZ location gate is shown');
  assert.equal(await page.locator('button.stage.locked').isDisabled(), true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: proofDir + '/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
    'mobile layout does not overflow horizontally');
  assert.deepEqual(errors, [], 'no browser page errors');
  assert.deepEqual(mutationRequests, [], 'workspace never issues outbound mutation requests');
  console.log('PA funding workspace Playwright checks passed: auth, sourcing, filtering, evidence, checklist, APPLY lock, mobile.');
  await context.close();
} finally {
  await browser.close();
}
