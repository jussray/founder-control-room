/**
 * Focused actual-browser UI contract using the real served Control Room JS.
 * API fixtures are intercepted at the network boundary: no real founder auth,
 * shell execution, production session, deployment or provider access is claimed.
 */
import { test, expect } from '@playwright/test';

test('terminal form renders read-only authority and omits legacy write confirmation', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.addInitScript(() => {
    sessionStorage.setItem('fcr_session', JSON.stringify({
      access_token: 'ui-only-test-token',
      email: 'ui-test@example.test',
    }));
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/terminal/demo/commands') {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ commands: [{ id: 'git.head', label: 'Read HEAD', risk: 'read', timeoutMs: 1000 }] }) });
      return;
    }
    if (pathname === '/terminal/demo/run') {
      submitted = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'passed' }) });
      return;
    }
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.continue();
  });

  await page.goto('/control-room/');
  await page.locator('.tabs button[data-tab="terminal"]').click();
  await page.locator('#terminal-project-slug').fill('demo');
  await page.locator('#terminal-load-commands').click();
  await page.locator('#terminal-commands .card[data-id="git.head"]').click();

  await expect(page.locator('#terminal-run-panel')).toContainText('Read-only commands only');
  await expect(page.locator('#terminal-run-form input[name="confirmWrite"]')).toHaveCount(0);
  await page.locator('#terminal-run-form input[name="missionId"]').fill('mission-test');
  await page.locator('#terminal-run-form input[name="expectedCommitSha"]').fill('a'.repeat(40));
  await page.locator('#terminal-run-form button[type="submit"]').click();

  await expect.poll(() => submitted).toEqual({
    commandId: 'git.head',
    missionId: 'mission-test',
    expectedCommitSha: 'a'.repeat(40),
  });
});
