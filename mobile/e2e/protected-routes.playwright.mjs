import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:19006';
const cases = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
try {
  await mkdir('test-results', { recursive: true });
  for (const entry of cases) {
    const context = await browser.newContext({
      viewport: { width: entry.width, height: entry.height },
      isMobile: entry.name === 'mobile',
    });
    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      // A cold link to a founder-only route must resolve to the guest entry.
      await page.goto(new URL('/dashboard', origin).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      try {
        await page.getByText('Your control room, without cloning its authority.').waitFor({
          timeout: 30000,
        });
      } catch (error) {
        await page.screenshot({ path: `test-results/failure-${entry.name}.png`, fullPage: true }).catch(() => {});
        console.error('Browser diagnostic:', JSON.stringify({
          viewport: entry.name,
          url: page.url(),
          body: (await page.locator('body').innerText().catch(() => '')).slice(0, 2000),
          pageErrors,
        }));
        throw error;
      }
      assert.equal(new URL(page.url()).pathname, '/', 'guest dashboard link should redirect to login');
      assert.equal(await page.getByText('Latest tasks', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Enter Control Room' }).count(), 1);

      await page.screenshot({
        path: `test-results/guest-${entry.name}.png`,
        fullPage: true,
      });

      // Reloading cannot restore protected navigation without a session.
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.getByRole('button', { name: 'Enter Control Room' }).waitFor({ timeout: 60000 });
      assert.equal(new URL(page.url()).pathname, '/');
      assert.deepEqual(pageErrors, [], `unexpected browser errors in ${entry.name}`);
      console.log(`PASS ${entry.name}: protected deep link redirects to guest sign-in`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
