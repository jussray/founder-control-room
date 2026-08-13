import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(here, '../public/portable-founder-console/index.html');
const outputDir = resolve(here, '../artifacts/portable-founder-console');

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

try {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'domcontentloaded' });

    const cardText = await page.locator('#brief-card').innerText();
    assert.match(cardText, /State\s+VALIDATED/);
    assert.match(cardText, /Evidence witness\s+GitHub exact-head proof/);
    assert.match(cardText, /Execution receipt\s+Not issued yet/);

    const witnessText = await page.locator('[data-evidence-contract="state-evidence-claim"]').innerText();
    assert.match(witnessText, /40-char Git SHA matched/);
    assert.match(witnessText, /pending until EXECUTED/);

    const executedRule = await page.locator('.state', { hasText: 'EXECUTED' }).innerText();
    assert.match(executedRule, /receipt ID, exact SHA, and downstream witness/);

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
    }));
    assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${viewport.name} must not overflow horizontally`);

    await page.screenshot({
      path: resolve(outputDir, `portable-founder-console-${viewport.name}.png`),
      fullPage: true,
    });
    await page.close();
  }

  console.log(JSON.stringify({ ok: true, contract: 'state-evidence-claim' }, null, 2));
} finally {
  await browser.close();
}
