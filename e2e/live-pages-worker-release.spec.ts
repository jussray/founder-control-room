import { expect, test } from '@playwright/test';

const expectedSha = process.env.EXPECTED_HEAD_SHA ?? '';

test('live Pages front door and API proxy resolve the exact approved release', async ({ page, request }) => {
  expect(expectedSha).toMatch(/^[0-9a-f]{40}$/);

  const directVersion = await request.get('/version', {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(directVersion.ok()).toBe(true);
  expect(directVersion.headers()['x-founder-control-room-service']).toBe('founder-control-room');
  await expect(directVersion.json()).resolves.toMatchObject({
    service: 'founder-control-room',
    gitSha: expectedSha,
  });

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBe(true);
  await expect(page.getByText('Founder Control Room', { exact: false }).first()).toBeVisible();

  const browserVersion = await page.evaluate(async () => {
    const response = await fetch('/version', {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    return {
      status: response.status,
      service: response.headers.get('x-founder-control-room-service'),
      body: await response.json(),
    };
  });

  expect(browserVersion.status).toBe(200);
  expect(browserVersion.service).toBe('founder-control-room');
  expect(browserVersion.body).toMatchObject({
    service: 'founder-control-room',
    gitSha: expectedSha,
  });
});
