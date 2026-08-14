import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDir = resolve(repoRoot, 'test-results/capabilities-workbench');
const session = JSON.stringify({
  access_token: 'synthetic-playwright-session',
  user: { email: 'founder@example.test' },
});

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:8788',
  });
  await context.addInitScript(value => {
    window.sessionStorage.setItem('fcr_session', value);
  }, session);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`renders the founder capability path on ${viewport.name}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => {
      failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/control-room/capabilities.html', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle('Capabilities · Founder Control Room');
    await expect(page.getByRole('heading', { name: 'webhook-verify-hmac-worker-v1' })).toBeVisible();

    const search = page.getByLabel('Search reviewed capabilities');
    await search.fill('social performance');
    await expect(page.getByRole('button', { name: /social-performance-analyzer-v1/ })).toBeVisible();
    await page.getByRole('button', { name: /social-performance-analyzer-v1/ }).click();
    await expect(page.getByRole('heading', { name: 'social-performance-analyzer-v1' })).toBeVisible();

    const copy = page.getByRole('button', { name: 'Copy implementation' });
    await copy.focus();
    await expect(copy).toBeFocused();
    await copy.click();
    await expect(page.getByRole('status')).toContainText('Execution still requires an FCR mission and proof gate');

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    expect(consoleErrors, `browser console errors on ${viewport.name}`).toEqual([]);
    expect(failedRequests, `failed requests on ${viewport.name}`).toEqual([]);

    mkdirSync(outputDir, { recursive: true });
    await page.screenshot({
      path: resolve(outputDir, `${viewport.name}-capabilities-workbench.png`),
      fullPage: true,
    });
  });
}

test('keeps the workbench behind the founder session boundary', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  await page.goto('/control-room/capabilities.html', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Capabilities are founder-only.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to sign in' })).toHaveAttribute('href', '/control-room/');

  await context.close();
});
