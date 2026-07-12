import { test, expect } from '@playwright/test';

test('publishes a public-safe vision and guardrail status', async ({ page }) => {
  await page.goto('/guardrails');
  await expect(page).toHaveTitle('Founder Control Room Guardrails');
  await expect(page.locator('html')).toHaveAttribute('data-guardrails', 'active');
  await expect(page.getByTestId('vision-stage')).toContainText('backend-foundation');
  await expect(page.locator('[data-guardrail-id="FCR-AUTH-001"]')).toBeVisible();
  await expect(page.locator('[data-guardrail-id="FCR-APPROVAL-001"]')).toBeVisible();
  await expect(page.getByTestId('sensitive-status')).toContainText('sensitiveFieldsIncluded=false');
  await expect(page.getByTestId('approval-status')).toContainText('approvalCarryForward=false');
});

test('public status never exposes credentials or private product fields', async ({ page }) => {
  const response = await page.request.get('/guardrails.json');
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|Bearer\s+[A-Za-z0-9._-]+|mcgill\.raylene@gmail\.com/i);
  expect(body).not.toMatch(/journal_text|voice_transcript|private_companion|service_role_key/i);

  const snapshot = JSON.parse(body);
  expect(snapshot.sensitiveFieldsIncluded).toBe(false);
  expect(snapshot.approvalCarryForward).toBe(false);
});

test('health is public but project state remains founder-protected', async ({ request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ ok: true });

  const project = await request.get('/projects/sekret-bip');
  expect([401, 403]).toContain(project.status());
});
