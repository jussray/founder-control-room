import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDir = resolve(repoRoot, 'test-results/public-work-directory');

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

function publicAssets(): FetchBinding {
  return {
    fetch: async (request: Request) => {
      const pathname = new URL(request.url).pathname;
      const source = pathname === '/'
        ? 'public/index.html'
        : pathname === '/work.html'
          ? 'public/work.html'
          : pathname === '/juss-rayy/' || pathname === '/juss-rayy'
            ? 'public/juss-rayy/index.html'
            : null;
      if (!source) return new Response('not found', { status: 404 });
      return new Response(readFileSync(resolve(repoRoot, source), 'utf8'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
}

test('public front door visibly links people to Juss Rayy and the public work directory', async ({ page }) => {
  const handler = await loadHandler();
  let apiCalls = 0;
  const fcrApi = {
    fetch: async () => {
      apiCalls += 1;
      return new Response('unexpected API route', { status: 500 });
    },
  };

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/', { headers: { accept: 'text/html' } }),
    { ASSETS: publicAssets(), FCR_API: fcrApi },
  );

  expect(response.status).toBe(200);
  expect(apiCalls).toBe(0);
  await page.setContent(await response.text());

  await expect(page.getByRole('link', { name: 'Explore public work' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore public work' })).toHaveAttribute('href', '/work.html');
  await expect(page.getByRole('link', { name: 'Meet Juss Rayy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Meet Juss Rayy' })).toHaveAttribute('href', '/juss-rayy/');

  mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: resolve(outputDir, 'desktop-front-door-founder-work.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await page.screenshot({ path: resolve(outputDir, 'mobile-front-door-founder-work.png'), fullPage: true });
});

test('serves the public work directory from Pages and keeps live/source states distinct', async ({ page }) => {
  const handler = await loadHandler();
  let apiCalls = 0;

  const fcrApi = {
    fetch: async () => {
      apiCalls += 1;
      return new Response('unexpected API route', { status: 500 });
    },
  };

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/work.html', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: publicAssets(), FCR_API: fcrApi },
  );

  expect(response.status).toBe(200);
  expect(apiCalls).toBe(0);
  await page.setContent(await response.text());

  await expect(page).toHaveTitle('Juss Rayy | Work you can use and inspect');
  await expect(page.getByRole('heading', { name: 'Work you can use. Proof you can inspect.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Juss Rayy ↗' })).toHaveAttribute('href', '/juss-rayy/');
  await expect(page.locator('[data-project="founder-control-room"]')).toContainText('PUBLIC SITE');
  await expect(page.locator('[data-project="sekret-bip"]')).toContainText('PUBLIC SITE');
  await expect(page.locator('[data-project="juss-beautiful-hair"]')).toContainText('STORE PATH UNDER VERIFICATION');
  await expect(page.locator('[data-project="untold-stories"]')).toContainText('STORE PATH UNDER VERIFICATION');
  await expect(page.getByRole('link', { name: 'Open public site' }).first()).toHaveAttribute('href', 'https://www.foundercontrolroom.org/');
  await expect(page.getByRole('link', { name: 'Open public site' }).nth(1)).toHaveAttribute('href', 'https://sekretbip.net/');

  mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: resolve(outputDir, 'desktop-work-directory.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await page.screenshot({ path: resolve(outputDir, 'mobile-work-directory.png'), fullPage: true });
});

test('renders Claude Cowork as a GitHub-grounded Council lane in the founder stack', async ({ page }) => {
  const appHtml = readFileSync(resolve(repoRoot, 'public/control-room/index.html'), 'utf8');
  const stackRouterSource = readFileSync(resolve(repoRoot, 'public/control-room/stack-router.js'), 'utf8')
    .replace("import { installMissionBoard } from './mission-board.js';", 'const installMissionBoard = () => {};')
    .replace("import { installProjectShellUi } from './project-shell-ui.js';", 'const installProjectShellUi = () => {};');

  await page.setContent(appHtml);
  await page.addScriptTag({ content: stackRouterSource, type: 'module' });
  await page.locator('.launch-dock > summary').click();

  const cowork = page.locator('[data-lane="cowork"]');
  await expect(cowork).toBeVisible();
  await expect(cowork.getByRole('heading', { name: /Cowork/ })).toBeVisible();
  await expect(cowork).toContainText('Claude Cowork');
  await expect(cowork).toContainText('Claude GitHub connector required');
  await expect(cowork).toContainText('FCR receipt adapter not wired');
  await expect(cowork).not.toContainText('GitHub + Council receipts');
  await expect(cowork.getByRole('link', { name: /Shared GitHub source/ })).toHaveAttribute('href', '/control-room/github-workspace.html');
  await expect(cowork.getByRole('link', { name: /Founder AI Council/ })).toHaveAttribute('href', '/control-room/?tab=missions');
  await expect(page.getByText('Cowork changes return through GitHub commit / PR evidence; FCR receipt binding remains separate')).toBeVisible();

  mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: resolve(outputDir, 'desktop-cowork-council.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await page.screenshot({ path: resolve(outputDir, 'mobile-cowork-council.png'), fullPage: true });
});
