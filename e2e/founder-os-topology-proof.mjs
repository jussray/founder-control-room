import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/control-room/index.html', import.meta.url), 'utf8');
const EXPECTED_SYSTEMS = [
  'ultrathink',
  'promptos',
  'chief-ai-machine',
  'founder-control-room',
  'project-runtime',
  'evidence-trust',
  'solcontinuity',
];

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
      return json(route, {
        contract: 'founder-control-room/n8n-conveyor@v3',
        readiness: { state: 'not-configured' },
      });
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
    if (url.pathname === '/l99/status') {
      return json(route, { standaloneLaunchReady: false, redTeamVerdict: 'Evidence before authority.', oodaFiringOrder: [] });
    }
    if (url.pathname === '/promptos') return json(route, { templates: [] });
    if (url.pathname === '/agents') return json(route, { agents: [] });
    if (url.pathname === '/authority-levels') return json(route, { levels: [] });
    if (url.pathname === '/version') return json(route, { service: 'founder-control-room', gitSha: 'c'.repeat(40) });

    return route.fulfill({ status: 404, body: `not found: ${request.method()} ${url.pathname}` });
  });
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installRoutes(page);

  await page.goto('https://fcr.test/control-room/', { waitUntil: 'networkidle' });
  const topology = page.locator('[data-fcr-os-topology="fcr/os-topology@v1"]');
  await topology.waitFor();

  assert.deepEqual(
    await topology.locator('[data-os-system]').evaluateAll((nodes) => nodes.map((node) => node.dataset.osSystem)),
    EXPECTED_SYSTEMS,
    'Founder OS systems must render in the canonical handoff order',
  );
  assert.equal(
    await topology.locator('[data-authority-transfer]').getAttribute('data-authority-transfer'),
    'false',
    'the rendered topology must never claim authority transfer',
  );
  assert.equal(
    await topology.locator('[data-authority-owner="true"]').count(),
    1,
    'FCR must remain the only rendered authority owner',
  );
  assert.match(await topology.textContent(), /L99 stays a Chief operating method, not a rival control plane/);

  await topology.locator('[data-os-system="promptos"]').click();
  await page.locator('.founder-screen-nav button[aria-current="page"]').filter({ hasText: 'PromptOS' }).waitFor();
  await page.getByText('Turn instructions into reusable operating intelligence.', { exact: true }).waitFor();

  await page.locator('.founder-screen-nav button', { hasText: 'Home' }).click();
  await topology.waitFor();
  await topology.locator('[data-os-system="chief-ai-machine"]').click();
  await page.locator('.founder-screen-nav button[aria-current="page"]').filter({ hasText: 'Chief' }).waitFor();
  await page.getByText('Decide what should happen next.', { exact: true }).waitFor();

  await page.locator('.founder-screen-nav button', { hasText: 'Home' }).click();
  await topology.waitFor();
  await topology.locator('[data-os-system="founder-control-room"]').click();
  await page.locator('.founder-screen-nav button[aria-current="page"]').filter({ hasText: 'Control' }).waitFor();
  await page.getByText('Control the project, not the codebase map.', { exact: true }).waitFor();

  assert.deepEqual(pageErrors, [], 'Founder OS topology proof must not emit page errors');
  await page.close();
} finally {
  await browser.close();
}

console.log('Founder OS topology Playwright proof passed: ULTRATHINK → PromptOS → Chief → FCR → project runtime → Proof → Continuity is rendered through the real control-room index, FCR remains the only authority owner, handoffs remain non-authorizing, and PromptOS/Chief/Control navigation is live.');