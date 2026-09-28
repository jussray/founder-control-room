import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const html = readFileSync(new URL('../public/control-room/index.html', import.meta.url), 'utf8');
const proofDir = 'test-results/founder-local-first';
const durableProofDir = 'logs/founder-local-first';
mkdirSync(proofDir, { recursive: true });
mkdirSync(durableProofDir, { recursive: true });

const project = {
  slug: 'sekret-bip',
  name: "Se'kret Bip",
  repo_provider: 'github',
  risk_level: 'medium',
  status: 'active',
};

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function staticControlRoomAsset(pathname) {
  if (!pathname.startsWith('/control-room/') || pathname.includes('..')) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(pathname)) return null;
  try {
    const body = readFileSync(new URL(`../public${pathname}`, import.meta.url), 'utf8');
    const contentType = pathname.endsWith('.css')
      ? 'text/css'
      : pathname.endsWith('.html')
        ? 'text/html'
        : 'text/javascript';
    return { body, contentType };
  } catch {
    return null;
  }
}

async function installRoutes(page) {
  await page.route('https://fcr.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/control-room/' || url.pathname === '/control-room') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    const staticAsset = staticControlRoomAsset(url.pathname);
    if (staticAsset) return route.fulfill({ status: 200, contentType: staticAsset.contentType, body: staticAsset.body });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/auth/me') {
      return json(route, { success: true, data: { founder: { email: 'founder@example.com' } } });
    }
    if (url.pathname === '/automation/conveyor/') {
      return json(route, { contract: 'founder-control-room/n8n-conveyor@v3', readiness: { state: 'not-configured' } });
    }
    if (url.pathname === '/projects' && request.method() === 'GET') return json(route, { projects: [project] });
    if (url.pathname === '/projects/sekret-bip' && request.method() === 'GET') {
      return json(route, { project, live: { defaultBranch: 'main' } });
    }
    if (url.pathname === '/projects/sekret-bip/files') return json(route, { ref: 'main', path: '', entries: [] });
    if (url.pathname === '/projects/sekret-bip/releases') return json(route, { releases: [] });
    if (url.pathname === '/projects/sekret-bip/connections') return json(route, { connections: [] });
    if (url.pathname === '/dashboard/tasks') return json(route, { tasks: [] });
    if (url.pathname === '/dashboard/activity') return json(route, { activity: [] });
    if (url.pathname === '/dashboard/costs') return json(route, { totalUsd: 0, byAgent: [] });
    if (url.pathname === '/l99/status') return json(route, { standaloneLaunchReady: false, redTeamVerdict: '', oodaFiringOrder: [] });
    if (url.pathname === '/promptos') return json(route, { templates: [] });
    if (url.pathname === '/agents') return json(route, { agents: [] });
    if (url.pathname === '/authority-levels') return json(route, { levels: [] });
    if (url.pathname === '/version') return json(route, { service: 'founder-control-room', gitSha: 'c'.repeat(40) });

    return route.fulfill({ status: 404, body: `not found: ${request.method()} ${url.pathname}` });
  });
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
try {
  const first = await context.newPage();
  await installRoutes(first);
  await first.goto('https://fcr.test/control-room/', { waitUntil: 'networkidle' });
  await first.locator('.founder-screen-nav button', { hasText: 'Control' }).click();
  await first.locator('#project-list .card[data-slug="sekret-bip"]').click();
  await first.locator('#project-detail h2').waitFor();

  await first.waitForFunction(() => {
    const contextValue = JSON.parse(localStorage.getItem('fcr_founder_context') || '{}');
    return contextValue.projectSlug === 'sekret-bip';
  });

  await context.setOffline(true);
  await first.locator('.founder-screen-nav button', { hasText: 'PromptOS' }).click();
  await first.waitForFunction(() => localStorage.getItem('fcr_founder_screen') === 'promptos');

  const offlineState = await first.evaluate(() => ({
    screen: localStorage.getItem('fcr_founder_screen'),
    view: localStorage.getItem('fcr_founder_view'),
    context: JSON.parse(localStorage.getItem('fcr_founder_context') || '{}'),
    outbox: JSON.parse(localStorage.getItem('fcr_founder_local_first_outbox_v1') || '[]'),
    leakedSession: localStorage.getItem('fcr_session'),
  }));
  assert.equal(offlineState.screen, 'promptos', 'offline founder navigation must commit locally');
  assert.equal(offlineState.context.projectSlug, 'sekret-bip');
  assert.equal(offlineState.leakedSession, null, 'opaque founder session must never be mirrored to durable local state');
  assert.ok(offlineState.outbox.some((entry) => entry.key === 'fcr_founder_screen' && entry.payload === 'promptos'));
  assert.ok(offlineState.outbox.some((entry) => entry.key === 'fcr_founder_context' && entry.payload?.projectSlug === 'sekret-bip'));

  await context.setOffline(false);
  await first.close();

  const reopened = await context.newPage();
  await installRoutes(reopened);
  await reopened.goto('https://fcr.test/control-room/', { waitUntil: 'networkidle' });
  await reopened.locator('.founder-screen-nav button[aria-current="page"]').filter({ hasText: 'PromptOS' }).waitFor();
  await reopened.locator('.founder-context').waitFor();
  assert.match(await reopened.locator('.founder-context').textContent(), /Se'kret Bip/);

  const restoredState = await reopened.evaluate(() => ({
    sessionScreen: sessionStorage.getItem('fcr_founder_screen'),
    durableScreen: localStorage.getItem('fcr_founder_screen'),
    sessionContext: JSON.parse(sessionStorage.getItem('fcr_founder_context') || '{}'),
    durableContext: JSON.parse(localStorage.getItem('fcr_founder_context') || '{}'),
    leakedSession: localStorage.getItem('fcr_session'),
  }));
  assert.equal(restoredState.sessionScreen, 'promptos');
  assert.equal(restoredState.durableScreen, 'promptos');
  assert.equal(restoredState.sessionContext.projectSlug, 'sekret-bip');
  assert.deepEqual(restoredState.sessionContext, restoredState.durableContext);
  assert.equal(restoredState.leakedSession, null);

  const screenshotPath = `${proofDir}/fresh-tab-restored.png`;
  const durableScreenshotPath = `${durableProofDir}/fresh-tab-restored.png`;
  await reopened.screenshot({ path: screenshotPath, fullPage: true });
  copyFileSync(screenshotPath, durableScreenshotPath);
  await reopened.close();
} finally {
  await context.close();
  await browser.close();
}

console.log('Founder local-first Playwright proof passed: project context persisted locally, offline navigation committed without network authority, a fresh tab restored durable workspace state, and opaque founder session material stayed out of localStorage.');