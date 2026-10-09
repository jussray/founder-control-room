import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const origin = process.env.LIVE_ORIGIN || 'https://foundercontrolroom.org';
const target = new URL(origin);
if (target.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(target.hostname)) {
  throw new Error('Production witness requires HTTPS');
}
const output = path.resolve(process.env.VISUAL_PROOF_DIR || 'test-results/fcr-live-visual-witness');
mkdirSync(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  })) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const record = { name, origin: target.origin, viewport, checkedAt: new Date().toISOString(), status: 'BLOCKED' };
    try {
      const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      record.httpStatus = response?.status() ?? null;
      await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled' });
      record.title = await page.title();
      record.finalUrl = page.url();
      record.dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      record.pageErrors = errors;
      record.status = record.httpStatus >= 200 && record.httpStatus < 400 &&
        new URL(record.finalUrl).origin === target.origin &&
        record.dimensions.scrollWidth <= record.dimensions.clientWidth &&
        errors.length === 0 ? 'CAPTURED' : 'REVIEW_REQUIRED';
    } catch (error) {
      record.error = String(error);
    } finally {
      results.push(record);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(path.join(output, 'receipt.json'), JSON.stringify({
  kind: 'fcr-live-visual-witness',
  source: origin,
  commit: process.env.GITHUB_SHA || 'UNKNOWN',
  comparisonToApprovedReferences: 'NOT_PERFORMED',
  productionVisualParity: 'UNVERIFIED',
  results,
}, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.status !== 'CAPTURED')) process.exitCode = 1;
