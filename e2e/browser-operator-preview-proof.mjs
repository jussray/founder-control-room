/**
 * Static FCR Browser Operator screen proof with a synthetic mocked API.
 * No live site, session, or provider is touched; this is a UI behavior proof.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const html = await readFile(path.join(root, 'public/control-room/browser-operator.html'), 'utf8');
const js = await readFile(path.join(root, 'public/control-room/browser-operator.js'), 'utf8');
const base = 'https://fcr-browser-test.invalid';
const outDir = path.join(root, 'test-results/browser-operator-ui');
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 860 }, isMobile: width === 390 });
    const page = await context.newPage();
    let authenticated = false;
    let previewCalls = 0;
    await page.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl === base + '/control-room/browser-operator.html') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      }
      if (requestUrl === base + '/control-room/browser-operator.js') {
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: js });
      }
      if (requestUrl === base + '/auth/me') {
        return route.fulfill({
          status: authenticated ? 200 : 401,
          contentType: 'application/json',
          body: authenticated
            ? JSON.stringify({ founder: { email: 'fixture@example.test' } })
            : JSON.stringify({ error: 'Founder session required' })
        });
      }
      if (requestUrl === base + '/browser-operator/preview') {
        previewCalls++;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'REQUIRES_FOUNDER_RUN_APPROVAL',
            project: 'sync-party-game',
            targetOrigin: 'https://games.jussco.company',
            actorCount: 2,
            stepCount: 53,
            browserExecuted: false,
            approvalIssued: false,
            nextGate: 'Separate run authorization required'
          })
        });
      }
      return route.abort('blockedbyclient');
    });

    await page.goto(base + '/control-room/browser-operator.html');
    await page.getByText('Sign in through Founder Control Room').waitFor();
    assert.equal(await page.locator('#operator-workspace').isHidden(), true);
    assert.equal(previewCalls, 0, 'unauthenticated UI must not attempt plan preview');

    authenticated = true;
    await page.reload();
    await page.locator('#operator-workspace').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Preview test plan' }).click();
    await page.getByText('Review required').waitFor();
    assert.equal(await page.locator('#plan-steps').textContent(), '53');
    assert.equal(await page.getByRole('button', { name: /Execute — not yet enabled/ }).isDisabled(), true);
    assert.equal(previewCalls, 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, 'UI must not overflow the mobile/desktop viewport');
    await page.screenshot({ path: path.join(outDir, 'preview-' + width + '.png'), fullPage: true });
    await context.close();
  }
  console.log('FCR Browser Operator preview UI verified at mobile and desktop with synthetic API fixtures. Live API and browser runner not exercised.');
} finally {
  await browser.close();
}
