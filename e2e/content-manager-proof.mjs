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

  const stageNames = await page.locator('[data-content-stage] h2').allTextContents();
  assert.deepEqual(stageNames, [
    'Verified proof',
    'Create draft',
    'Review',
    'Founder approval',
    'Schedule',
    'Explicit publish',
    'Metrics receipt',
  ]);

  const founderLane = page.locator('[data-founder-progress-lane]');
  await founderLane.waitFor({ state: 'visible' });
  assert.equal(await founderLane.getAttribute('data-founder-authority'), 'current-you');
  assert.equal(await founderLane.getAttribute('data-provider-write-state'), 'separate-gate');
  assert.equal(await founderLane.getAttribute('data-analytics-authority'), 'observation-only');

  const founderLaneText = await founderLane.innerText();
  assert.match(founderLaneText, /Tell the progress\. Keep the machinery private\./);
  assert.match(founderLaneText, /What can go public/);
  assert.match(founderLaneText, /What stays behind the curtain/);
  assert.match(founderLaneText, /Current You authorizes/i);
  assert.match(founderLaneText, /FutureYou is advisory only/i);
  assert.match(founderLaneText, /Analytics can improve later drafts, never authorize them/i);
  assert.match(founderLaneText, /Share-now is forbidden for this lane/i);
  assert.match(founderLaneText, /Live provider writes remain a separate server-side authorization and credential gate/i);

  const founderCards = await founderLane.locator('[data-founder-lane-card]').count();
  assert.equal(founderCards, 3, 'founder progress lane must keep public, private, and authority boundaries visible');
  assert.equal(await founderLane.locator('button, .action').count(), 0, 'founder progress lane must not present a fake provider-write control');

  const statusPills = await page.locator('[aria-label="Content authority status"] .pill').allTextContents();
  assert(statusPills.includes('Founder progress engine ready'));
  assert(statusPills.includes('Sauce-safe by contract'));
  assert(statusPills.includes('Current You approval required'));
  assert(statusPills.includes('Provider write stays separate'));

  const actions = await page.locator('.action').allTextContents();
  assert(actions.includes('Open proof ledger'));
  assert(actions.includes('Open activity receipts'));

  const policyText = await page.locator('.blocker').innerText();
  assert.match(policyText, /402/);
  assert.match(policyText, /must never translate/i);
  assert.match(policyText, /missing provider receipt/i);
  assert.match(policyText, /published/i);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    flowWidth: document.querySelector('.flow')?.clientWidth ?? 0,
    flowScrollWidth: document.querySelector('.flow')?.scrollWidth ?? 0,
    founderLaneWidth: document.querySelector('[data-founder-progress-lane]')?.clientWidth ?? 0,
  }));

  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, 'page must not overflow the mobile viewport');
  assert(dimensions.flowScrollWidth > dimensions.flowWidth, 'workflow must remain horizontally explorable on mobile');
  assert(dimensions.founderLaneWidth > 0 && dimensions.founderLaneWidth <= dimensions.viewportWidth, 'founder progress lane must fit the mobile viewport');

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
    stages: stageNames,
    founderProgress: {
      authority: 'current-you',
      providerWrite: 'separate-gate',
      analyticsAuthority: 'observation-only',
      fakeWriteControls: 0,
    },
    screenshot: 'test-results/content-manager-mobile.png',
    overflow: dimensions,
  }, null, 2));
} finally {
  await browser.close();
}
