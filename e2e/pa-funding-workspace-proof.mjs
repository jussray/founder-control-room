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

const storedReviews = new Map();
async function wire(page, signedIn, founderEmail = 'founder@example.com') {
  await page.route(ORIGIN + '/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/me') {
      return route.fulfill({
        status: signedIn ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(signedIn
          ? { success: true, data: { founder: { email: founderEmail } } }
          : { error: 'unauthorized' }),
      });
    }
    if (url.pathname === '/pa-funding/reviews' && route.request().method() === 'GET') {
      const records=Array.from(storedReviews.entries()).filter(([key])=>key.startsWith(founderEmail+':'))
        .map(([key,value])=>({id:key.slice(founderEmail.length+1),...value}));
      return route.fulfill({status:signedIn?200:401,contentType:'application/json',
        body:JSON.stringify({records,applicationAuthorized:false})});
    }
    if (url.pathname.startsWith('/pa-funding/reviews/') && route.request().method() === 'PUT') {
      if(!signedIn)return route.fulfill({status:401,body:'unauthorized'});
      const id=url.pathname.split('/').pop();
      const body=route.request().postDataJSON();
      if(body.stage==='APPLY')return route.fulfill({status:400,body:'APPLY locked'});
      const record={stage:body.stage,checks:body.checks,evidenceNote:body.evidenceNote,updatedAt:'2026-11-11T00:00:00Z'};
      storedReviews.set(founderEmail+':'+id,record);
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({record:{id,...record},applicationAuthorized:false})});
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
  await page.screenshot({ path: proofDir + '/desktop.png', fullPage: true });
  assert.equal(await page.locator('#open-count').innerText(), '2',
    'only CEA Growth and Impact have confirmed opening windows');
  assert.equal(await page.locator('button.stage.locked').isDisabled(), true, 'APPLY is locked');
  assert.match(await page.locator('#details').innerText(), /UNKNOWN/, 'applicant eligibility unknown');
  assert.match(await page.locator('#details').innerText(), /Dec 31, 2026/, 'CEA deadline visible');

  await page.locator('button[data-tab="evidence"]').click();
  const officialLink = page.locator('#tab-content a.source-link');
  assert.match(await officialLink.getAttribute('href'), /^https:\/\/www\.pa\.gov\//,
    'evidence points to official PA source');
  await page.locator('#evidence-note').fill('internal:eligibility-review-needed');
  await page.locator('#save-evidence').click();
  await page.locator('button[data-tab="receipt"]').click();
  for (const label of ['REALITY', 'FIX', 'PROOF', 'RISK', 'ROLLBACK', 'NEXT GATE']) {
    assert.ok((await page.locator('#tab-content').innerText()).includes(label), label + ' receipt field');
  }

  await page.locator('button[data-tab="checklist"]').click();
  await page.locator('input[data-check="0"]').check();
  await page.locator('button[data-stage="PREPARE"]').click();
  assert.match(await page.locator('.detail-meta .meta-value').nth(3).innerText(), /^UNKNOWN/,
    'prep does not convert UNKNOWN to eligible');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#workspace:not([hidden])').waitFor();
  assert.equal(await page.locator('input[data-check="0"]').isChecked(), true,
    'checklist persists within this browser tab session');
  assert.equal(await page.locator('button[data-stage="PREPARE"]').getAttribute('aria-pressed'), 'true',
    'stage persists through the authenticated private API');
  await page.locator('button[data-tab="evidence"]').click();
  assert.equal(await page.locator('#evidence-note').inputValue(),'internal:eligibility-review-needed',
    'private evidence reference persists on reload');
  await page.locator('button[data-tab="checklist"]').click();

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
  await page.locator('button[data-id="alphalab"]').click();
  assert.match(await page.locator('#details').innerText(), /Jul 17, 2026/, 'closed AlphaLab deadline shown');
  assert.match(await page.locator('.op-card.selected').innerText(), /CLOSED/, 'AlphaLab not mislabeled as intake-open');
  await page.locator('button[data-id="cea-growth"]').click();
  assert.equal(await page.locator('input[data-check="0"]').isChecked(), true, 'original founder checklist exists');
  await wire(page, true, 'other-founder@example.com');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#workspace:not([hidden])').waitFor();
  assert.equal(await page.locator('input[data-check="0"]').isChecked(), false,
    'another authenticated founder cannot inherit prior account checklist state');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: proofDir + '/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
    'mobile layout does not overflow horizontally');
  assert.deepEqual(errors, [], 'no browser page errors');
  assert.ok(mutationRequests.length>=2,'private checklist and evidence updates were sent');
  assert.ok(mutationRequests.every(url=>new URL(url).pathname.startsWith('/pa-funding/reviews/')),
    'the workspace only mutates its own private review endpoint, never external funding systems');
  console.log('PA funding workspace Playwright checks passed: auth, sourcing, filtering, evidence, checklist, APPLY lock, mobile.');
  await context.close();
} finally {
  await browser.close();
}
