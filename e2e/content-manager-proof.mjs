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

  const actions = await page.locator('.action').allTextContents();
  assert(actions.includes('Open proof ledger'));
  assert(actions.includes('Open activity receipts'));

  const policyText = await page.locator('.blocker').innerText();
  assert.match(policyText, /402/);
  assert.match(policyText, /must never translate/i);
  assert.match(policyText, /published/i);

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
    stages: stageNames,
    screenshot: 'test-results/content-manager-mobile.png',
    overflow: dimensions,
  }, null, 2));
} finally {
  await browser.close();
}
