import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDir = resolve(repoRoot, 'test-results/pages-api-recovery');
const originalFetch = globalThis.fetch;

type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

type PagesHandler = {
  fetch(request: Request, env: { ASSETS: AssetBinding }): Promise<Response>;
};

async function loadHandler(): Promise<PagesHandler> {
  const source = readFileSync(resolve(repoRoot, 'public/_worker.js'), 'utf8');
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
  return module.default as PagesHandler;
}

const assets = {
  fetch: async (_request: Request) => new Response('asset', { status: 200 }),
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('renders a usable degraded-service recovery screen on desktop and mobile', async ({ page }) => {
  const handler = await loadHandler();
  globalThis.fetch = async () => new Response('Hello world', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/auth/callback?type=magiclink', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: assets },
  );

  expect(response.status).toBe(503);
  expect(response.headers.get('retry-after')).toBe('120');
  expect(response.headers.get('x-founder-control-room-degraded')).toBe(
    'API_SERVICE_IDENTITY_MISMATCH',
  );

  await page.setContent(await response.text());

  await expect(page).toHaveTitle('Founder Control Room temporarily unavailable');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute(
    'href',
    '/auth/callback?type=magiclink',
  );
  await expect(page.getByRole('link', { name: 'Return to control room' })).toHaveAttribute(
    'href',
    '/',
  );

  await page.getByRole('link', { name: 'Try again' }).focus();
  await expect(page.getByRole('link', { name: 'Try again' })).toBeFocused();

  mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: resolve(outputDir, 'desktop-degraded-service.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Recovery actions' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.screenshot({
    path: resolve(outputDir, 'mobile-degraded-service.png'),
    fullPage: true,
  });
});

test('preserves a verified Founder Control Room API response', async () => {
  const handler = await loadHandler();
  globalThis.fetch = async () => new Response('{"ok":true}', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-founder-control-room-service': 'founder-control-room',
    },
  });

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/health', {
      headers: { accept: 'application/json' },
    }),
    { ASSETS: assets },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('x-founder-control-room-service')).toBe('founder-control-room');
  await expect(response.json()).resolves.toEqual({ ok: true });
});
