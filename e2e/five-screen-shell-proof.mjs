import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const html = readFileSync(new URL('../public/control-room/index.html', import.meta.url), 'utf8');

const proofDir = 'test-results/five-screen-shell';
const durableProofDir = 'logs/five-screen-shell';
mkdirSync(proofDir, { recursive: true });
mkdirSync(durableProofDir, { recursive: true });

const HOME_READ_PATHS = new Set(['/projects', '/dashboard/tasks', '/dashboard/activity', '/version']);

const project = {
  slug: 'sekret-bip',
  name: "Se'kret Bip",
  repo_provider: 'github',
  risk_level: 'medium',
  status: 'active',
};

const mission = {
  id: 'mission-1',
  title: 'Verify launch runtime identity',
  description: 'Bind the live runtime to the approved candidate.',
  status: 'in_review',
  risk_level: 'medium',
  branch_ref: 'proof/runtime-identity',
  builder_agent: 'codex',
  reviewer_agent: 'redteam',
  project: { slug: project.slug },
};

const activity = [{
  created_at: '2026-09-17T18:30:00.000Z',
  project: { slug: project.slug },
  severity: 'info',
  event_type: 'playwright.runtime-proof-passed',
}];

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

function recordRead(readCounts, pathname, method) {
  if (!(readCounts instanceof Map) || method !== 'GET' || !HOME_READ_PATHS.has(pathname)) return;
  readCounts.set(pathname, (readCounts.get(pathname) ?? 0) + 1);
}

async function installRoutes(page, readCounts = null) {
  await page.route('https://fcr.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    recordRead(readCounts, url.pathname, request.method());

    if (url.pathname === '/control-room/' || url.pathname === '/control-room') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    const staticAsset = staticControlRoomAsset(url.pathname);
    if (staticAsset) {
      return route.fulfill({ status: 200, contentType: staticAsset.contentType, body: staticAsset.body });
    }
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
    if (url.pathname === '/projects/sekret-bip/files') {
      return json(route, { ref: 'main', path: '', entries: [] });
    }
    if (url.pathname === '/projects/sekret-bip/releases') return json(route, { releases: [] });
    if (url.pathname === '/projects/sekret-bip/connections') return json(route, { connections: [] });
    if (url.pathname === '/projects/sekret-bip/missions' && request.method() === 'POST') {
      return json(route, { mission: { id: 'created-mission' } }, 201);
    }
    if (url.pathname === '/dashboard/tasks') return json(route, { tasks: [mission] });
    if (url.pathname === '/dashboard/activity') return json(route, { activity });
    if (url.pathname === '/dashboard/costs') return json(route, { totalUsd: 1.25, byAgent: [] });
    if (url.pathname === '/l99/status') {
      return json(route, { standaloneLaunchReady: false, redTeamVerdict: 'Evidence before authority.', oodaFiringOrder: [] });
    }
    if (url.pathname === '/promptos') return json(route, { templates: [] });
    if (url.pathname === '/agents') return json(route, { agents: [] });
    if (url.pathname === '/authority-levels') return json(route, { levels: [] });
    if (url.pathname === '/version') {
      return json(route, { service: 'founder-control-room', gitSha: 'b'.repeat(40) });
    }
    if (url.pathname === '/missions/mission-1/council') return json(route, { conversations: [] });
    if (url.pathname === '/missions/mission-1/runs') return json(route, { runs: [] });
    if (url.pathname === '/missions/mission-1/costs') return json(route, { costs: [], totalUsd: 0 });

    return route.fulfill({ status: 404, body: `not found: ${request.method()} ${url.pathname}` });
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${label}: horizontal overflow ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`,
  );
}

async function proveDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const homeReadCounts = new Map();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installRoutes(page, homeReadCounts);

  await page.goto('https://fcr.test/control-room/', { waitUntil: 'networkidle' });
  await page.locator('.founder-screen-nav').waitFor();

  assert.deepEqual(
    await page.locator('.founder-screen-nav button').allTextContents(),
    ['Home', 'Control', 'Chief', 'PromptOS', 'Proof'],
  );
  assert.equal(
    await page.locator('.tabs[data-legacy-tabs="true"]').evaluate((node) => getComputedStyle(node).display),
    'none',
  );
  await page.getByText('What needs you now?', { exact: true }).waitFor();
  assert.match(await page.locator('.founder-home').textContent(), /Verify launch runtime identity/);
  assert.match(
    await page.locator('.founder-home').textContent(),
    /Resolve review findings and bind fresh proof to the exact head/,
  );
  assert.match(await page.locator('.founder-home').textContent(), /bbbbbbbbbbbb/);

  const settledHomeReads = Object.fromEntries(homeReadCounts);
  await page.waitForTimeout(350);
  assert.deepEqual(
    Object.fromEntries(homeReadCounts),
    settledHomeReads,
    'Home reads must remain stable after render; shell-owned DOM mutations must not trigger refetch loops',
  );

  await page.locator('.founder-screen-nav button', { hasText: 'Control' }).click();
  await page.getByText('Register a project', { exact: true }).waitFor();
  assert.deepEqual(
    await page.locator('.founder-subnav button').allTextContents(),
    ['Overview', 'Work', 'Costs', 'Execution'],
  );

  await page.locator('#project-list .card[data-slug="sekret-bip"]').click();
  await page.locator('#new-mission-form').waitFor();
  await page.locator('#new-mission-form input[name="title"]').fill('Prove founder geography copy');
  await page.locator('#new-mission-form button[type="submit"]').click();
  await page.getByText('Mission created. Open Control → Work.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Mission created. See the Missions tab.', { exact: true }).count(), 0);

  await page.locator('.founder-subnav button', { hasText: 'Work' }).click();
  const missionCard = page.locator('#mission-lanes .card[data-id="mission-1"]');
  await missionCard.waitFor();
  await missionCard.click();
  await page.locator('#mission-detail h2').filter({ hasText: mission.title }).waitFor();

  const context = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fcr_founder_context') || '{}'));
  assert.equal(context.projectSlug, 'sekret-bip');
  assert.equal(context.missionId, 'mission-1');
  assert.equal(context.missionTitle, mission.title);

  await page.locator('.founder-screen-nav button', { hasText: 'PromptOS' }).click();
  await page.getByText('New template', { exact: true }).waitFor();
  assert.ok(
    (await page.locator('.founder-context').textContent())?.includes(project.name),
    'cross-screen context should render the founder-visible project name',
  );
  assert.match(await page.locator('.founder-context').textContent(), /Verify launch runtime identity/);

  await page.locator('.founder-screen-nav button', { hasText: 'Control' }).click();
  await page.locator('.founder-subnav button[aria-current="page"]').filter({ hasText: 'Work' }).waitFor();
  await page.locator('#mission-detail h2').filter({ hasText: mission.title }).waitFor();

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.founder-screen-nav button[aria-current="page"]').filter({ hasText: 'Control' }).waitFor();
  await page.locator('.founder-subnav button[aria-current="page"]').filter({ hasText: 'Work' }).waitFor();
  await page.locator('#mission-detail h2').filter({ hasText: mission.title }).waitFor();
  await assertNoHorizontalOverflow(page, 'desktop five-screen cockpit');
  assert.deepEqual(pageErrors, [], 'desktop cockpit must not emit page errors');

  const screenshotPath = `${proofDir}/desktop-context-restored.png`;
  const durableScreenshotPath = `${durableProofDir}/desktop-context-restored.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  copyFileSync(screenshotPath, durableScreenshotPath);
  await page.close();
}

async function proveLegacyRouteAndMobile(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installRoutes(page);

  await page.goto('https://fcr.test/control-room/?tab=activity', { waitUntil: 'networkidle' });
  await page.locator('.founder-screen-nav button[aria-current="page"]').filter({ hasText: 'Proof' }).waitFor();
  await page.getByText('What actually happened?', { exact: true }).waitFor();
  await page.getByText('playwright.runtime-proof-passed', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('tab'), null);
  assert.equal(new URL(page.url()).searchParams.get('screen'), 'proof');
  await assertNoHorizontalOverflow(page, 'mobile proof screen');
  assert.deepEqual(pageErrors, [], 'mobile proof screen must not emit page errors');

  const screenshotPath = `${proofDir}/mobile-proof.png`;
  const durableScreenshotPath = `${durableProofDir}/mobile-proof.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  copyFileSync(screenshotPath, durableScreenshotPath);
  await page.close();
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
try {
  await proveDesktop(browser);
  await proveLegacyRouteAndMobile(browser);
} finally {
  await browser.close();
}

console.log('Five-screen shell Playwright proof passed through the real control-room index: five permanent screens, bounded Home reads, hidden legacy compatibility tabs, real Home data, founder-facing Control/Work copy, Control subviews, cross-screen project/mission context, reload restoration, stack-router legacy route migration, mobile overflow, and screenshot receipts.');
