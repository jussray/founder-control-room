import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(here, '../public/control-room/content-manager.html');
const outputDir = resolve(here, '../test-results');

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'domcontentloaded' });

  assert.equal(await page.locator('h1').innerText(), 'Post from your own product.');
  assert.equal(await page.locator('main').getAttribute('data-content-authority-state'), 'awaiting-proposal');
  assert.equal(await page.locator('[data-founder-content-preview]').getAttribute('data-proposal-state'), 'empty');
  assert.match(await page.locator('[data-founder-content-preview]').innerText(), /No verified proposal loaded/i);
  assert.equal(await page.locator('[data-internal-evidence-state]').getAttribute('data-internal-evidence-state'), 'unknown');
  assert.equal(await page.locator('[data-sauce-state]').getAttribute('data-sauce-state'), 'unknown');
  assert.equal(await page.locator('[data-public-proof-state]').getAttribute('data-public-proof-state'), 'optional-off');
  assert.equal(await page.locator('[data-current-you-state]').getAttribute('data-current-you-state'), 'not-requested');
  assert.equal(await page.locator('[data-review-window-state]').getAttribute('data-review-window-state'), 'not-handed-off');
  assert.equal(await page.locator('[data-provider-state]').getAttribute('data-provider-state'), 'unknown');
  assert.equal(await page.locator('[data-outcome-state]').getAttribute('data-outcome-state'), 'unknown');
  assert.equal(await page.locator('[data-public-proof-link-toggle]').count(), 0, 'empty state must not expose a fake proof-link control');

  const stageNames = await page.locator('[data-content-stage] h2').allTextContents();
  assert.deepEqual(stageNames, [
    'Verified progress',
    'Chief story',
    'FCR verify',
    'Current You',
    'Review window',
    'Provider receipt',
    'Outcome learning',
  ]);

  const topStatus = await page.locator('.status-row').first().innerText();
  assert.match(topStatus, /Internal evidence required/i);
  assert.match(topStatus, /Sauce guard required/i);
  assert.match(topStatus, /Public proof link optional/i);
  assert.match(topStatus, /Current You authorizes/i);
  assert.doesNotMatch(topStatus, /Verified/i);

  const authorityText = await page.locator('.authority').innerText();
  assert.match(authorityText, /Chief AI owns/i);
  assert.match(authorityText, /Founder Control Room owns/i);
  assert.match(authorityText, /Providers own/i);
  assert.match(authorityText, /Actual schedule\/publication state/i);

  const policyText = await page.locator('.boundary').innerText();
  assert.match(policyText, /does not mean a provider write already happened/i);
  assert.match(policyText, /provider receipt must still be read back/i);
  assert.match(policyText, /published/i);

  const reviewText = await page.locator('[data-content-stage="review"]').innerText();
  assert.match(reviewText, /review-window lane/i);
  assert.match(reviewText, /No instant share/i);

  const learningText = await page.locator('[data-content-stage="learning"]').innerText();
  assert.match(learningText, /Missing metrics stay UNKNOWN/i);
  assert.match(learningText, /analytics can never increase authority/i);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    flowWidth: document.querySelector('.flow')?.clientWidth ?? 0,
    flowScrollWidth: document.querySelector('.flow')?.scrollWidth ?? 0,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, 'page must not overflow the mobile viewport');
  assert(dimensions.flowScrollWidth > dimensions.flowWidth, 'workflow must remain horizontally explorable on mobile');

  await page.locator('.action.primary').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Open proof ledger');

  await page.screenshot({
    path: resolve(outputDir, 'content-manager-mobile.png'),
    fullPage: true,
  });

  console.log(JSON.stringify({
    ok: true,
    route: '/control-room/content-manager.html',
    viewport: '390x844',
    authorityState: 'awaiting-proposal',
    evidenceState: 'unknown',
    sauceState: 'unknown',
    publicProofLinkState: 'optional-off',
    currentYouState: 'not-requested',
    reviewWindowState: 'not-handed-off',
    providerState: 'unknown',
    outcomeState: 'unknown',
    stages: stageNames,
    screenshot: 'test-results/content-manager-mobile.png',
    overflow: dimensions,
  }, null, 2));
} finally {
  await browser.close();
}
