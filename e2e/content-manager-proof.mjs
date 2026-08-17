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

  const title = await page.locator('h1').innerText();
  assert.equal(title, 'Post from your own product.');

  const stageNames = await page.locator('[data-content-stage] h2').allTextContents();
  assert.deepEqual(stageNames, [
    'Verified progress',
    'Chief story',
    'Sauce guard',
    'FCR draft',
    'Current You approval',
    'Provider handoff',
    'Outcome learning',
  ]);

  const proofToggle = page.locator('[data-public-proof-link-toggle]');
  assert.equal(await proofToggle.isChecked(), false, 'public proof link must default off');
  await proofToggle.check();
  assert.equal(await proofToggle.isChecked(), true, 'founder can editorially include a public proof link');
  await proofToggle.uncheck();
  assert.equal(await proofToggle.isChecked(), false, 'founder can keep the public post link-free');

  const statusText = await page.locator('.status-row').first().innerText();
  assert.match(statusText, /Internal evidence required/);
  assert.match(statusText, /Sauce protected/);
  assert.match(statusText, /Public proof link optional/);
  assert.match(statusText, /Current You approves/);

  const authorityText = await page.locator('.authority').innerText();
  assert.match(authorityText, /Chief AI owns/);
  assert.match(authorityText, /Founder Control Room owns/);
  assert.match(authorityText, /Providers own/);
  assert.match(authorityText, /Never the canonical copy or founder authority/i);

  const actions = await page.locator('.action').allTextContents();
  assert(actions.includes('Open proof ledger'));
  assert(actions.includes('Open activity receipts'));

  const policyText = await page.locator('.blocker').innerText();
  assert.match(policyText, /does not mean a provider write already happened/i);
  assert.match(policyText, /OAuth\/API authorization remains a separate provider capability/i);
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
    publicProofLinkDefault: 'off',
    screenshot: 'test-results/content-manager-mobile.png',
    overflow: dimensions,
  }, null, 2));
} finally {
  await browser.close();
}
