// Founder Home dashboard proof — real browser, real static frontend, stub API.
//
// What this proves: the signed-in Control Room shell at /control-room/ renders
// the cinematic Home surface (sidebar, topbar, hero, KPI strip, Active
// projects, Today's focus, Live signals, section tiles) from the JSON the
// founder API returns; every KPI figure equals the served data; anything FCR
// does not observe is rendered as UNKNOWN / "Not connected" and carries no
// digits; the tab contract other proofs depend on (`.tabs button[data-tab]`,
// `#new-project-form`, `#project-list .card`, `.founder-email`) still holds
// without a click; the `?tab=` deep link through stack-router.js still
// activates a tab; nothing overflows at 1440 and 390; and the signed-out
// surface is the unchanged magic-link card.
//
// What this does NOT prove: the real Express routes, Supabase, GitHub, or
// production deployment. Those are e2e/run.mjs (npm run test:e2e) and CI.
// The API here is a stub at the network boundary so this proof runs with
// nothing but Node, Playwright and the checked-out public/ directory.

import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete process.env[key];
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const REPO_ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const PUBLIC_DIR = resolve(REPO_ROOT, 'public');
const OUT_DIR = resolve(REPO_ROOT, 'test-results');
const FOUNDER_EMAIL = 'founder@example.com';

// Serve the production CSP so an inline script, external font/image, or
// disallowed connect surfaces here as a console error instead of only in prod.
const CSP = readFileSync(resolve(PUBLIC_DIR, '_headers'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .find((line) => line.startsWith('Content-Security-Policy:'))
  ?.slice('Content-Security-Policy:'.length)
  .trim();
if (!CSP) throw new Error('public/_headers no longer declares a Content-Security-Policy');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const NOW = Date.now();
const iso = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();

const FIXTURE = {
  projects: [
    { slug: 'sekret-bip', name: 'Se’kret Bip', repo_provider: 'github', risk_level: 'high', status: 'active' },
    { slug: 'chief-ai', name: 'Chief AI', repo_provider: 'github', risk_level: 'medium', status: 'active' },
    { slug: 'storyengine', name: 'StoryEngine', repo_provider: 'github', risk_level: 'low', status: 'archived' },
  ],
  tasks: [
    { id: 'm-1', title: 'Review Bip partnership proposal', status: 'in_review', risk_level: 'high', project: { slug: 'sekret-bip' } },
    { id: 'm-2', title: 'Finalize Chief vNext roadmap', status: 'proposed', risk_level: 'medium', project: { slug: 'chief-ai' } },
    { id: 'm-3', title: 'Approve L99 market testing plan', status: 'approved', risk_level: 'medium', project: { slug: 'chief-ai' } },
    { id: 'm-4', title: 'Record founder update', status: 'sandboxed', risk_level: 'low', project: { slug: 'storyengine' } },
    { id: 'm-5', title: 'Ship static path fix', status: 'integrated', risk_level: 'low', project: { slug: 'storyengine' } },
    { id: 'm-6', title: 'Front door recovery', status: 'deployed', risk_level: 'high', project: { slug: 'sekret-bip' } },
    { id: 'm-7', title: 'Old idea', status: 'rejected', risk_level: 'low', project: { slug: 'chief-ai' } },
  ],
  activity: [
    // Read-audit rows the server writes on every GET /projects and /l99/status
    // read — real events, but a Home load must not count itself as a signal.
    { created_at: iso(0), project: { slug: 'founder-control-room' }, severity: 'info', event_type: 'project_registry_read' },
    { created_at: iso(0), project: { slug: 'founder-control-room' }, severity: 'info', event_type: 'l99_status_read' },
    { created_at: iso(2), project: { slug: 'sekret-bip' }, severity: 'info', event_type: 'mission.in_review' },
    { created_at: iso(14), project: { slug: 'chief-ai' }, severity: 'warning', event_type: 'ci.failed' },
    { created_at: iso(37), project: { slug: 'storyengine' }, severity: 'info', event_type: 'mission.integrated' },
    { created_at: iso(61), project: { slug: 'sekret-bip' }, severity: 'info', event_type: 'proof.recorded' },
    { created_at: iso(120), project: { slug: 'chief-ai' }, severity: 'error', event_type: 'deploy.rolled_back' },
    { created_at: iso(180), project: { slug: 'storyengine' }, severity: 'info', event_type: 'project.registered' },
    { created_at: iso(240), project: { slug: 'sekret-bip' }, severity: 'info', event_type: 'agent.assigned' },
  ],
  l99: {
    standaloneLaunchReady: false,
    redTeamVerdict: 'Two gates pass; one has not run.',
    oodaFiringOrder: [
      { order: 1, label: 'Authority chain', status: 'pass', requiresApproval: false },
      { order: 2, label: 'Evidence receipt', status: 'pass', requiresApproval: false },
      { order: 3, label: 'Founder approval', status: 'not_run', requiresApproval: true },
    ],
  },
  costs: { totalUsd: 1.2345, byAgent: [{ agentName: 'claude-builder', provider: 'anthropic', inputTokens: 100, outputTokens: 50, costUsd: 1.2345 }] },
  agents: [{ id: 'claude-builder', label: 'Claude builder' }],
  levels: [{ level: 'L1', label: 'Read' }],
  templates: [],
};

const IN_FLIGHT = new Set(['proposed', 'sandboxed', 'in_review', 'approved']);
const LIVE_SIGNALS = FIXTURE.activity.filter((ev) => !/_read$/.test(ev.event_type));
const expectedInFlight = FIXTURE.tasks.filter((t) => IN_FLIGHT.has(t.status)).length;
const expectedInReview = FIXTURE.tasks.filter((t) => t.status === 'in_review').length;
const expectedLanded = FIXTURE.tasks.filter((t) => t.status === 'integrated' || t.status === 'deployed').length;

/** mode: 'full' | 'l99-down' | 'reads-down' | 'signed-out' */
function startServer(mode) {
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/auth/me') {
      return mode === 'signed-out'
        ? json(res, 401, { success: false, error: 'No founder session' })
        : json(res, 200, { success: true, data: { founder: { email: FOUNDER_EMAIL } } });
    }
    if (mode === 'signed-out' && path.startsWith('/auth/')) return json(res, 401, { error: 'unauthenticated' });

    const api = {
      '/projects': { projects: FIXTURE.projects },
      '/dashboard/tasks': { tasks: FIXTURE.tasks },
      '/dashboard/activity': { activity: FIXTURE.activity },
      '/dashboard/costs': FIXTURE.costs,
      '/agents': { agents: FIXTURE.agents },
      '/authority-levels': { levels: FIXTURE.levels },
      '/promptos': { templates: FIXTURE.templates },
    };
    if (path === '/l99/status') {
      return mode === 'l99-down' ? json(res, 503, { error: 'L99 status unavailable' }) : json(res, 200, FIXTURE.l99);
    }
    if (mode === 'reads-down' && (path === '/projects' || path === '/dashboard/activity')) {
      return json(res, 503, { error: `${path} unavailable` });
    }
    if (path in api) return json(res, 200, api[path]);
    const projectMatch = path.match(/^\/projects\/([^/]+)(?:\/(releases|connections|files))?$/);
    if (projectMatch) {
      const project = FIXTURE.projects.find((p) => p.slug === decodeURIComponent(projectMatch[1]));
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (projectMatch[2] === 'releases') return json(res, 200, { releases: [] });
      if (projectMatch[2] === 'connections') return json(res, 200, { connections: [] });
      if (projectMatch[2] === 'files') return json(res, 200, { ref: url.searchParams.get('ref') ?? 'main', path: url.searchParams.get('path') ?? '', entries: [{ type: 'file', path: 'README.md' }] });
      return json(res, 200, { project, live: { defaultBranch: 'main' } });
    }
    if (/^\/missions\/[^/]+\/council$/.test(path)) return json(res, 200, { conversations: [] });
    if (/^\/missions\/[^/]+\/runs$/.test(path)) return json(res, 200, { runs: [] });
    if (/^\/missions\/[^/]+\/costs$/.test(path)) return json(res, 200, { totalUsd: 0, costs: [] });
    // Sibling scripts loaded by index.html (stack-router.js, project-shell-ui.js)
    // poll these; they are outside this proof's subject and answered with
    // their honest "not configured" shapes so the console stays clean.
    if (path === '/automation/conveyor/') return json(res, 200, { contract: 'founder-control-room/n8n-conveyor@v3', readiness: { state: 'not-configured' } });
    if (path === '/projects/sekret-bip/shell-state') return json(res, 404, { error: 'shell-state not stubbed' });
    if (path.startsWith('/api/')) { console.log(`  (unstubbed 404: ${path})`); return json(res, 404, { error: 'not stubbed' }); }

    // static
    let filePath = normalize(join(PUBLIC_DIR, decodeURIComponent(path)));
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
    if (!existsSync(filePath)) { console.log(`  (static 404: ${path})`); return json(res, 404, { error: 'not found' }); }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => resolveServer({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  ok — ${message}`);
  else { failures += 1; console.error(`  FAIL — ${message}`); }
}

async function noOverflow(page, label) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  assert(scrollWidth <= innerWidth, `${label}: no horizontal overflow (scrollWidth ${scrollWidth} ≤ viewport ${innerWidth})`);
}

async function withPage(browser, viewport, fn) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const networkDiagnostics = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // project-shell-ui.js probes a Bip shell-state route this stub does not
    // serve; its 404 is an expected network diagnostic, not a UI failure.
    if (/shell-state$/.test(msg.location()?.url ?? '')) { networkDiagnostics.push(msg.location().url); return; }
    consoleErrors.push(`${msg.text()} @ ${msg.location()?.url ?? ''}`);
  });
  try {
    await fn(page);
  } finally {
    await context.close();
  }
  if (networkDiagnostics.length) console.log(`  (${networkDiagnostics.length} expected network diagnostic(s): ${JSON.stringify([...new Set(networkDiagnostics)])})`);
  return { pageErrors, consoleErrors };
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();

console.log('\n[1] Signed-in founder lands on the Home dashboard (desktop 1280×720, the run.mjs viewport)');
{
  const { server, baseUrl } = await startServer('full');
  const { pageErrors, consoleErrors } = await withPage(browser, { width: 1280, height: 720 }, async (page) => {
    // Hold the API until the first paint has been inspected: before any read
    // settles every KPI must be UNKNOWN, never an "observed" zero.
    let releaseApi;
    const apiGate = new Promise((r) => { releaseApi = r; });
    await page.route((url) => /\/(projects|dashboard\/tasks|dashboard\/activity|dashboard\/costs|l99\/status)$/.test(url.pathname), async (route) => { await apiGate; await route.continue(); });
    await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'load' });
    await page.waitForSelector('.topbar', { timeout: 10_000 });
    await page.waitForSelector('[data-home-kpis] [data-kpi="projects"]', { timeout: 10_000 });
    const firstPaint = await page.locator('[data-kpi]').evaluateAll((nodes) => nodes.map((n) => [n.dataset.kpi, n.dataset.truth, n.querySelector('.kpi-value').textContent.trim()]));
    assert(firstPaint.filter(([, truth]) => truth === 'observed').length === 0, `first paint claims nothing as observed (${JSON.stringify(firstPaint)})`);
    assert(firstPaint.every(([, truth, value]) => truth === 'not-wired' || value === 'UNKNOWN'), 'every unread KPI shows UNKNOWN before its read settles');
    releaseApi();
    await page.waitForSelector('[data-kpi="projects"][data-truth="observed"]', { timeout: 10_000 });
    await page.waitForSelector('[data-kpi="spend"][data-truth="observed"]', { timeout: 10_000 });

    assert((await page.locator('.founder-email').innerText()) === FOUNDER_EMAIL, 'topbar shows the founder email');
    assert((await page.locator('.tabs button[data-tab="home"].active').count()) === 1, 'Home is the active tab without any click');
    const tabIds = await page.locator('.tabs button[data-tab]').evaluateAll((nodes) => nodes.map((n) => n.dataset.tab));
    assert(JSON.stringify(tabIds) === JSON.stringify(['home', 'projects', 'missions', 'activity', 'l99', 'promptos', 'analytics', 'terminal']), `sidebar keeps the tab-id contract (${tabIds.join(', ')})`);
    assert((await page.locator('.sidebar .side-link').count()) >= 4, 'sidebar links the sibling Control Room surfaces');
    assert((await page.locator('[data-systems-truth="unknown"]').count()) === 1, 'systems status is rendered as not observed, not as a green light');

    assert((await page.locator('.hero-title').innerText()).replace(/\s+/g, '') === 'ULTRATHINK', 'hero renders the ULTRATHINK headline');
    assert((await page.locator('.hero-greeting').innerText()).toLowerCase().includes('good '), 'hero greets the founder');
    assert((await page.locator('.chief-prompt').innerText()) === 'What are you trying to move forward?', 'Chief panel asks the mockup prompt');
    assert((await page.locator('.chief-route').count()) === 6, 'Chief panel exposes six routes');

    const kpi = async (id) => (await page.locator(`[data-kpi="${id}"] .kpi-value`).innerText()).trim();
    assert((await kpi('projects')) === String(FIXTURE.projects.length), `Projects KPI equals served project count (${FIXTURE.projects.length})`);
    assert((await kpi('missions')) === String(expectedInFlight), `Missions-in-flight KPI equals served in-flight count (${expectedInFlight})`);
    assert((await page.locator('[data-kpi="missions"] .kpi-sub').innerText()).includes(`${expectedInReview} in review`), 'in-review sub-count matches');
    assert((await kpi('landed')) === String(expectedLanded), `Integrated KPI equals integrated+deployed (${expectedLanded})`);
    assert((await kpi('signals')) === String(LIVE_SIGNALS.length), `Live-signals KPI counts served events minus the *_read audit rows (${LIVE_SIGNALS.length} of ${FIXTURE.activity.length})`);
    assert(!(await page.locator('[data-home-signals]').innerText()).includes('_read'), 'Live signals panel hides the read-audit rows this page load produced');
    assert((await kpi('l99')) === '2/3', 'L99 KPI equals passing/total gates from served status');
    assert((await kpi('spend')) === '$1.2345', 'Spend KPI equals served totalUsd at the Analytics tab precision (4dp)');
    for (const id of ['revenue', 'community']) {
      const value = await kpi(id);
      const truth = await page.locator(`[data-kpi="${id}"]`).getAttribute('data-truth');
      assert(truth === 'not-wired' && !/\d/.test(value), `${id} tile is marked not-wired and shows no number (got "${value}")`);
    }
    assert((await page.locator('[data-kpi][data-truth="observed"]').count()) === 6, 'six KPIs are observed from served data');

    assert((await page.locator('#new-project-form').isVisible()), 'register-project form is present on Home without a click (run.mjs contract)');
    assert((await page.locator('#project-list .card').count()) === FIXTURE.projects.length, 'Active projects lists every served project through the real projects module');
    assert((await page.locator('[data-home-focus] .focus-item').count()) === expectedInFlight, `Today's focus lists the ${expectedInFlight} in-flight missions`);
    assert((await page.locator('[data-home-signals] .signal').count()) === Math.min(6, LIVE_SIGNALS.length), 'Live signals shows the latest six non-audit events');
    assert((await page.locator('.home-tiles .tile').count()) === 8, 'eight section tiles render');

    await noOverflow(page, 'desktop');
    await page.screenshot({ path: join(OUT_DIR, 'founder-home-desktop.png'), fullPage: true });

    // Home → project detail still works through the embedded projects module.
    await page.click('#project-list .card >> nth=0');
    await page.waitForSelector('#project-detail', { state: 'visible', timeout: 10_000 });
    assert((await page.locator('[data-home-detail] #project-detail').count()) === 1, 'selecting a project opens its detail panel full-width under the grid, still on Home');

    // Today's focus → Missions tab with the mission selected.
    await page.click('[data-focus-mission="m-1"]');
    await page.waitForSelector('.tabs button[data-tab="missions"].active', { timeout: 10_000 });
    await page.waitForSelector('#mission-detail', { state: 'visible', timeout: 10_000 });
    assert((await page.locator('#mission-lanes .lane').count()) === 8, 'focus item routes to the Missions board (8 lanes)');
    assert((await page.locator('#mission-detail').innerText()).includes('Review Bip partnership proposal'), 'the clicked mission is selected in its detail panel');

    // index.html pins a fixed launch dock to the bottom of the viewport. With
    // the sidebar shifting content into the dock's x-range, the last submit
    // button on a tab must scroll clear of it or every click on it times out
    // (this is exactly how run.mjs failed on the first CI run of this shell).
    for (const selector of ['#log-council-form button[type=submit]', '#log-cost-form button[type=submit]']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const box = await page.locator(selector).boundingBox();
      const dock = await page.locator('.launch-dock').boundingBox();
      const overlaps = Boolean(box && dock) && box.x < dock.x + dock.width && box.x + box.width > dock.x && box.y < dock.y + dock.height && box.y + box.height > dock.y;
      assert(box && dock && !overlaps, `${selector} scrolls clear of the fixed launch dock (button y=${box && Math.round(box.y)}, dock top=${dock && Math.round(dock.y)})`);
    }

    // Sidebar → Home again; KPI tile → Signals tab.
    await page.click('.tabs button[data-tab="home"]');
    await page.waitForSelector('[data-home-kpis]');
    await page.click('[data-kpi="signals"]');
    await page.waitForSelector('.tabs button[data-tab="activity"].active');
    assert((await page.locator('#activity-list .card').count()) === FIXTURE.activity.length, 'KPI tile routes to the Signals tab with the full activity list (audit rows included there)');
  });
  assert(pageErrors.length === 0, `no uncaught JS exceptions (saw: ${JSON.stringify(pageErrors)})`);
  assert(consoleErrors.length === 0, `no console errors (saw: ${JSON.stringify(consoleErrors)})`);
  server.close();
}

console.log('\n[2] ?tab= deep link still activates a tab through stack-router.js (mobile 390)');
{
  const { server, baseUrl } = await startServer('full');
  const { pageErrors } = await withPage(browser, { width: 390, height: 844 }, async (page) => {
    await page.goto(`${baseUrl}/control-room/?tab=terminal`, { waitUntil: 'load' });
    await page.waitForSelector('.tabs button[data-tab="terminal"].active', { timeout: 10_000 });
    assert((await page.locator('.tabs button.active').count()) === 1 && (await page.locator('#terminal-project-slug').count()) === 1, 'terminal tab activated from the URL and rendered its form');
    await page.click('.tabs button[data-tab="home"]');
    await page.waitForSelector('[data-home-kpis]');
    await noOverflow(page, 'mobile');
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    assert(sidebarBox && sidebarBox.width >= 380, 'sidebar collapses to a full-width strip on mobile');
    await page.screenshot({ path: join(OUT_DIR, 'founder-home-mobile.png'), fullPage: true });
  });
  assert(pageErrors.length === 0, `no uncaught JS exceptions (saw: ${JSON.stringify(pageErrors)})`);
  server.close();
}

console.log('\n[2b] Desktop 1440 overflow pass');
{
  const { server, baseUrl } = await startServer('full');
  const { pageErrors, consoleErrors } = await withPage(browser, { width: 1440, height: 960 }, async (page) => {
    await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-kpi="projects"][data-truth="observed"]', { timeout: 10_000 });
    await noOverflow(page, 'desktop 1440');
    await page.screenshot({ path: join(OUT_DIR, 'founder-home-desktop-1440.png'), fullPage: true });
  });
  assert(pageErrors.length === 0, `no uncaught JS exceptions (saw: ${JSON.stringify(pageErrors)})`);
  assert(consoleErrors.length === 0, `no console errors under the production CSP (saw: ${JSON.stringify(consoleErrors)})`);
  server.close();
}

console.log('\n[3] A failed L99 read renders UNKNOWN, never a number');
{
  const { server, baseUrl } = await startServer('l99-down');
  const { pageErrors } = await withPage(browser, { width: 1280, height: 900 }, async (page) => {
    await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-kpi="projects"][data-truth="observed"]', { timeout: 10_000 });
    const value = (await page.locator('[data-kpi="l99"] .kpi-value').innerText()).trim();
    const truth = await page.locator('[data-kpi="l99"]').getAttribute('data-truth');
    assert(value === 'UNKNOWN' && truth === 'unknown', `L99 KPI shows UNKNOWN with data-truth=unknown after the other reads settled (got "${value}", ${truth})`);
    assert((await page.locator('[data-kpi="l99"] .kpi-sub').innerText()).includes('read failed'), 'and says the read failed, not "not read yet"');
    assert((await page.locator('[data-kpi="spend"][data-truth="observed"]').count()) === 1, 'a sibling read that succeeded is still observed');
  });
  assert(pageErrors.length === 0, `no uncaught JS exceptions (saw: ${JSON.stringify(pageErrors)})`);
  server.close();
}

console.log('\n[3b] Failed project and activity reads render UNKNOWN, not an observed zero, and the banner names both');
{
  const { server, baseUrl } = await startServer('reads-down');
  const { pageErrors } = await withPage(browser, { width: 1280, height: 720 }, async (page) => {
    await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-kpi="missions"][data-truth="observed"]', { timeout: 10_000 });
    for (const id of ['projects', 'signals']) {
      const truth = await page.locator(`[data-kpi="${id}"]`).getAttribute('data-truth');
      const value = (await page.locator(`[data-kpi="${id}"] .kpi-value`).innerText()).trim();
      const sub = await page.locator(`[data-kpi="${id}"] .kpi-sub`).innerText();
      assert(truth === 'unknown' && value === 'UNKNOWN' && sub.includes('read failed'), `${id} KPI is UNKNOWN / read failed after a 503 (got ${truth} "${value}" "${sub}")`);
    }
    assert((await page.locator('[data-kpi="missions"] .kpi-value').innerText()).trim() === String(expectedInFlight), 'missions KPI is still observed from its own successful read');
    const banner = await page.locator('#tab-content > .error').first().innerText();
    assert(banner.includes('/projects') && banner.includes('/dashboard/activity'), `banner names every failed read (got "${banner}")`);
    assert((await page.locator('[data-home-focus] .focus-item').count()) === expectedInFlight, "Today's focus still renders from the successful missions read");
  });
  assert(pageErrors.length === 0, `no uncaught JS exceptions (saw: ${JSON.stringify(pageErrors)})`);
  server.close();
}

console.log('\n[4] Signed-out surface is the unchanged magic-link card');
{
  const { server, baseUrl } = await startServer('signed-out');
  const { pageErrors } = await withPage(browser, { width: 1280, height: 900 }, async (page) => {
    await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'load' });
    await page.waitForSelector('#magic-link-form', { timeout: 10_000 });
    assert((await page.locator('.sign-in-card h2').innerText()) === 'Founder Control Room', 'sign-in card still renders with its heading and form');
    assert((await page.locator('[data-home]').count()) === 0, 'no dashboard is rendered without a founder session');
    await page.screenshot({ path: join(OUT_DIR, 'founder-home-signed-out.png'), fullPage: true });
  });
  assert(pageErrors.length === 0, `no uncaught JS exceptions (saw: ${JSON.stringify(pageErrors)})`);
  server.close();
}

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nFounder Home dashboard proof: all assertions passed');
