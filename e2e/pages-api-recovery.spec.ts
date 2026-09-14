import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDir = resolve(repoRoot, 'test-results/pages-api-recovery');

type FetchBinding = {
  fetch(request: Request): Promise<Response>;
};

type PagesHandler = {
  fetch(request: Request, env: { ASSETS: FetchBinding; FCR_API: FetchBinding }): Promise<Response>;
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

test('renders conservative auth recovery guidance on desktop and mobile', async ({ page }) => {
  const handler = await loadHandler();
  const fcrApi = {
    fetch: async (_request: Request) => new Response('Hello world', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }),
  };

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/auth/callback?type=magiclink', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: assets, FCR_API: fcrApi },
  );

  expect(response.status).toBe(503);
  expect(response.headers.get('retry-after')).toBeNull();
  expect(response.headers.get('x-founder-control-room-degraded')).toBe(
    'API_SERVICE_IDENTITY_MISMATCH',
  );

  await page.setContent(await response.text());

  await expect(page).toHaveTitle('Founder Control Room temporarily unavailable');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await expect(page.getByRole('alert')).toContainText(
    'cannot confirm whether this request completed',
  );
  await expect(page.getByRole('link', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Check control room' })).toHaveAttribute(
    'href',
    '/',
  );

  await page.getByRole('link', { name: 'Check control room' }).focus();
  await expect(page.getByRole('link', { name: 'Check control room' })).toBeFocused();

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

test('offers retry only for a safe read navigation', async ({ page }) => {
  const handler = await loadHandler();
  const fcrApi = {
    fetch: async (_request: Request) => new Response('Connection timed out', { status: 522 }),
  };

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/health', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: assets, FCR_API: fcrApi },
  );

  expect(response.status).toBe(503);
  expect(response.headers.get('retry-after')).toBe('120');
  await page.setContent(await response.text());
  await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/health');
  await expect(page.getByRole('link', { name: 'Return to control room' })).toHaveAttribute(
    'href',
    '/',
  );
});

test('preserves a verified Founder Control Room API response through the service binding', async () => {
  const handler = await loadHandler();
  const fcrApi = {
    fetch: async (_request: Request) => new Response('{"ok":true}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-founder-control-room-service': 'founder-control-room',
      },
    }),
  };

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/health', {
      headers: { accept: 'application/json' },
    }),
    { ASSETS: assets, FCR_API: fcrApi },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('x-founder-control-room-service')).toBe('founder-control-room');
  await expect(response.json()).resolves.toEqual({ ok: true });
});

test('serves the owned Juss Rayy identity from Pages with machine-readable identity', async ({ page }) => {
  const handler = await loadHandler();
  const identityHtml = readFileSync(resolve(repoRoot, 'public/juss-rayy/index.html'), 'utf8');
  let apiCalls = 0;
  let assetRequestPath = '';

  const identityAssets = {
    fetch: async (request: Request) => {
      assetRequestPath = new URL(request.url).pathname;
      return new Response(identityHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
  const fcrApi = {
    fetch: async (_request: Request) => {
      apiCalls += 1;
      return new Response('unexpected API route', { status: 500 });
    },
  };

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/juss-rayy', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: identityAssets, FCR_API: fcrApi },
  );

  expect(response.status).toBe(200);
  expect(assetRequestPath).toBe('/juss-rayy');
  expect(apiCalls).toBe(0);

  await page.setContent(await response.text());
  await expect(page).toHaveTitle('Juss Rayy | Founder · Product & Systems Architect');
  await expect(page.getByRole('heading', { level: 1, name: 'Juss Rayy' })).toBeVisible();
  await expect(page.getByText('Historical truth is immutable. Current truth must be re-observed.')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://foundercontrolroom.org/juss-rayy',
  );
  await expect(page.locator('body[itemscope][itemtype="https://schema.org/ProfilePage"]')).toHaveCount(1);
  await expect(page.locator('main[itemprop="mainEntity"][itemtype="https://schema.org/Person"]')).toHaveCount(1);
  await expect(page.locator('link[itemprop="sameAs"][href="https://github.com/jussray"]')).toHaveCount(1);
  await expect(page.locator('link[itemprop="sameAs"][href="https://www.linkedin.com/in/juss-rayy-13ba691a1"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'Support the work' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sponsor on GitHub →' })).toHaveAttribute(
    'href',
    'https://github.com/sponsors/jussray',
  );
  await expect(page.getByRole('link', { name: 'Buy me a coffee' })).toHaveAttribute(
    'href',
    'https://buymeacoffee.com/jussrayy',
  );
  await expect(page.getByText(/does not represent an investment or ownership interest/i)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Juss Receipts' })).toBeVisible();

  mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: resolve(outputDir, 'juss-rayy-desktop.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { level: 1, name: 'Juss Rayy' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public identity links' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Support links' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.screenshot({
    path: resolve(outputDir, 'juss-rayy-mobile.png'),
    fullPage: true,
  });
});
