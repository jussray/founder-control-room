import { test, expect } from '@playwright/test';

const CANONICAL_RULESET = 'Founder Control Room main exact-head gate';
const SETTINGS_PATH = '/control-room/repository-settings.html';

test.describe('Repository Settings ruleset safety', () => {
  test('defaults active FCR main protection to the canonical hardened gate', async ({ page }) => {
    await page.goto(SETTINGS_PATH);

    await expect(page.locator('input[name="projectSlug"]')).toHaveValue('founder-control-room');
    await expect(page.locator('input[name="name"]')).toHaveValue(CANONICAL_RULESET);
    await expect(page.locator('select[name="enforcement"]')).toHaveValue('active');
    await expect(page.locator('input[name="targetRefs"]')).toHaveValue('main');
    await expect(page.locator('input[name="requirePullRequest"]')).toBeChecked();
    await expect(page.locator('input[name="requiredApprovingReviewCount"]')).toHaveValue('1');
    await expect(page.locator('input[name="requiredStatusCheckNames"]')).toHaveValue(
      'Required Gate, Verify test-ledger contract',
    );
  });

  test('blocks an accidental second active FCR main ruleset before any provider request', async ({ page }) => {
    let mutationRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/projects/founder-control-room/ruleset')
      ) {
        mutationRequests += 1;
      }
    });

    await page.goto(SETTINGS_PATH);
    await page.locator('input[name="name"]').fill('protect-main');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('#result')).toContainText(
      `Blocked: active Founder Control Room main protection must update the canonical ruleset "${CANONICAL_RULESET}"`,
    );
    expect(mutationRequests).toBe(0);
  });

  test('preserves deliberate rename flexibility outside active FCR main protection', async ({ page }) => {
    let submittedBody: Record<string, unknown> | null = null;

    await page.goto(SETTINGS_PATH);
    await page.evaluate(() => {
      sessionStorage.setItem('fcr_session', JSON.stringify({ access_token: 'playwright-test-token' }));
    });
    await page.route('**/projects/founder-control-room/ruleset', async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, result: { id: 'test', name: 'FCR main governance v2' } }),
      });
    });

    await page.locator('input[name="name"]').fill('FCR main governance v2');
    await page.locator('select[name="enforcement"]').selectOption('evaluate');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('#result')).toContainText('"ok": true');
    expect(submittedBody).toMatchObject({
      name: 'FCR main governance v2',
      enforcement: 'evaluate',
      targetRefs: ['main'],
    });
  });
});
