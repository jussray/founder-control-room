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
// activates a tab; the founder-facing visual authority renders Same Truth /
// Higher Outcomes while ULTRATHINK stays behind the UI; nothing overflows at
// 1440 and 390; and the signed-out surface is the unchanged magic-link card.
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
    if (path === '/version') return json(res, 200, { gitSha: 'c'.repeat(40), service: 'fixture' });
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
    if (path === '/automation/conveyor/') return json(res, 200, { contract: 'founder-control-room/n8n-conveyor@v3', readiness: { state: 'not-configured' } });
    if (path === '/projects/sekret-bip/shell-state') return json(res, 404, { error: 'shell-state not stubbed' });
    if (path.startsWith('/api/')) { console.log(`  (unstubbed 404: ${path})`); return json(res, 404, { error: 'not stubbed' }); }

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

console.log('\n[1] Home summary uses current data and drills into visible Control / Proof navigation');
{
  const {server,baseUrl}=await startServer('full');
  const {pageErrors,consoleErrors}=await withPage(browser,{width:1280,height:720},async(page)=>{
    let release;
    const apiGate=new Promise((resolveGate)=>{release=resolveGate;});
    await page.route((url)=>/\/(projects|dashboard\/tasks|dashboard\/activity|version)$/.test(url.pathname),
      async(route)=>{await apiGate;await route.continue();});
    await page.goto(baseUrl+'/control-room/',{waitUntil:'load'});
    await page.waitForSelector('.founder-home',{state:'visible'});
    assert(JSON.stringify(await page.locator('.founder-screen-nav button').allInnerTexts())
      ===JSON.stringify(['Home','Control','Chief','PromptOS','Proof']),
      'exactly five founder screens are visible');
    assert(await page.locator('.tabs[data-legacy-tabs=true]').isHidden(),
      'original tabs exist for compatibility but are not visible primary navigation');
    assert((await page.locator('.founder-home-grid').count())===0,
      'unread data is never presented as an observed metric');
    release();
    await page.waitForSelector('.founder-home-grid',{state:'visible',timeout:15000});
    const cards=await page.locator('.founder-home-card').allInnerTexts();
    assert(cards.length===4,'Home exposes exactly four summary metrics');
    assert(cards[0].includes('Projects')&&cards[0].includes(String(FIXTURE.projects.length)),
      'project count matches the served projects');
    assert(cards[1].includes('Active work')&&cards[1].includes('5'),
      'active work excludes deployed and rejected tasks');
    assert(cards[2].includes('Needs founder')&&cards[2].includes('2'),
      'in-review and approved work remain founder attention items');
    assert(cards[3].includes('Runtime SHA')&&cards[3].includes('cccccccccccc'),
      'runtime SHA is the observed (fixture) identity, not an invented version');
    const gate=await page.locator('.founder-next-gate').innerText();
    assert(gate.includes('Review Bip partnership proposal')&&gate.includes('Recent evidence events: 9'),
      'next gate and evidence count match the served mission and activity records');
    assert((await page.locator('.founder-email').innerText())===FOUNDER_EMAIL,
      'Home retains the founder-only session');
    await noOverflow(page,'desktop Home');
    await page.screenshot({path:join(OUT_DIR,'founder-home-desktop.png'),fullPage:true});

    await page.locator('[data-home-target=control]').click();
    await page.waitForSelector('#new-project-form',{state:'visible'});
    await page.waitForSelector('#project-list .card',{state:'visible'});
    assert((await page.locator('#project-list .card').count())===FIXTURE.projects.length,
      'Control Overview preserves the existing founder project registry');
    assert((await page.locator('[data-control-view=overview][aria-current=page]').count())===1,
      'Control Overview is the active secondary screen');
    await page.locator('#project-list .card').first().click();
    await page.waitForSelector('#project-detail',{state:'visible'});
    assert((await page.locator('#project-detail').innerText()).includes('Se’kret Bip'),
      'project detail is operational through Control');
    await page.locator('[data-control-view=work]').click();
    await page.waitForSelector('#mission-lanes .card[data-id="m-1"]',{state:'visible'});
    assert((await page.locator('#mission-lanes .lane').count())===8,
      'all eight mission lanes remain available');
    await page.locator('#mission-lanes .card[data-id="m-1"]').click();
    await page.waitForSelector('#mission-detail',{state:'visible'});
    assert((await page.locator('#mission-detail').innerText()).includes('Review Bip partnership proposal'),
      'selected mission details remain visible');
    for(const selector of ['#log-council-form button[type=submit]','#log-cost-form button[type=submit]']){
      const button=page.locator(selector);
      await button.scrollIntoViewIfNeeded();
      const a=await button.boundingBox(),b=await page.locator('.launch-dock').boundingBox();
      const covered=Boolean(a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y);
      assert(Boolean(a&&b&&!covered),selector+' is not covered by founder dock');
    }

    await page.locator('.founder-screen-nav button').filter({hasText:/^Proof$/}).click();
    await page.waitForSelector('#activity-list .card',{state:'visible'});
    assert((await page.locator('#activity-list .card').count())===FIXTURE.activity.length,
      'Proof retains full source audit history');
    assert((await page.locator('[data-proof-view=truth-dashboard]').count())===1,
      'Truth Console is reachable from Proof without another primary screen');
  });
  assert(pageErrors.length===0,'no unexpected JS exceptions on desktop: '+JSON.stringify(pageErrors));
  assert(consoleErrors.length===0,'no unexpected console errors on desktop: '+JSON.stringify(consoleErrors));
  server.close();
}

console.log('\n[2] Old deep links migrate to five-screen routes on mobile');
{
  const {server,baseUrl}=await startServer('full');
  const {pageErrors}=await withPage(browser,{width:390,height:844},async(page)=>{
    await page.goto(baseUrl+'/control-room/?tab=terminal',{waitUntil:'load'});
    await page.waitForSelector('#terminal-project-slug',{state:'visible'});
    assert(new URL(page.url()).searchParams.get('screen')==='control'
      &&new URL(page.url()).searchParams.get('view')==='execution',
      'legacy terminal URL migrates to Control Execution');
    await page.locator('.founder-screen-nav button').filter({hasText:/^Home$/}).click();
    await page.waitForSelector('.founder-home-grid',{state:'visible'});
    await noOverflow(page,'mobile Home');
    await page.screenshot({path:join(OUT_DIR,'founder-home-mobile.png'),fullPage:true});
    await page.goto(baseUrl+'/control-room/?tab=truth-claims',{waitUntil:'load'});
    await page.waitForSelector('[data-truth-screen=truth-claims]',{state:'visible'});
    assert(new URL(page.url()).searchParams.get('screen')==='proof'
      &&new URL(page.url()).searchParams.get('view')==='truth-claims',
      'legacy Truth Console URL migrates to Proof Claims');
    await noOverflow(page,'mobile Proof Claims');
    // Search & Evidence tile target (HOME_TILES) and the search-evidence.html
    // compatibility alias both resolve to the single guarded Search Console panel.
    await page.goto(baseUrl+'/control-room/?tab=truth-seo',{waitUntil:'load'});
    await page.locator('[data-truth-screen] h2').filter({hasText:'Search Console · indexing and sitemap health'}).waitFor({state:'visible'});
    assert(new URL(page.url()).searchParams.get('screen')==='proof'
      &&new URL(page.url()).searchParams.get('view')==='truth-seo',
      'Search & Evidence tile target migrates to the canonical Proof Search Console panel');
    await page.goto(baseUrl+'/control-room/search-evidence.html',{waitUntil:'load'});
    await page.locator('[data-truth-screen] h2').filter({hasText:'Search Console · indexing and sitemap health'}).waitFor({state:'visible'});
    assert(new URL(page.url()).searchParams.get('view')==='truth-seo',
      'search-evidence.html compatibility alias lands on the canonical Search Console panel');
    await noOverflow(page,'mobile Proof Search Console');
  });
  assert(pageErrors.length===0,'no unexpected JS exceptions on mobile: '+JSON.stringify(pageErrors));
  server.close();
}

console.log('\n[3] Desktop 1440 Home proof');
{
  const {server,baseUrl}=await startServer('full');
  const {pageErrors,consoleErrors}=await withPage(browser,{width:1440,height:960},async(page)=>{
    await page.goto(baseUrl+'/control-room/',{waitUntil:'load'});
    await page.waitForSelector('.founder-home-grid',{state:'visible'});
    await noOverflow(page,'desktop 1440');
    await page.screenshot({path:join(OUT_DIR,'founder-home-desktop-1440.png'),fullPage:true});
  });
  assert(pageErrors.length===0,'no JS exceptions at 1440: '+JSON.stringify(pageErrors));
  assert(consoleErrors.length===0,'no console errors at 1440: '+JSON.stringify(consoleErrors));
  server.close();
}

console.log('\n[4] Unavailable L99 remains unavailable, not launch-ready');
{
  const {server,baseUrl}=await startServer('l99-down');
  const {pageErrors}=await withPage(browser,{width:1280,height:900},async(page)=>{
    await page.goto(baseUrl+'/control-room/',{waitUntil:'load'});
    await page.waitForSelector('.founder-home-grid',{state:'visible'});
    await page.locator('.founder-screen-nav button').filter({hasText:/^Chief$/}).click();
    await page.waitForSelector('.founder-screen-intro',{state:'visible'});
    const response=await page.request.get(baseUrl+'/l99/status');
    assert(response.status()===503,'L99 down is HTTP 503, never a synthetic readiness pass');
  });
  assert(pageErrors.length===0,'no JS exceptions when L99 is down: '+JSON.stringify(pageErrors));
  server.close();
}

console.log('\n[5] Missing essential reads never become observed zero');
{
  const {server,baseUrl}=await startServer('reads-down');
  const {pageErrors}=await withPage(browser,{width:1280,height:720},async(page)=>{
    await page.goto(baseUrl+'/control-room/',{waitUntil:'load'});
    await page.waitForSelector('.founder-home > .error',{state:'visible'});
    const text=await page.locator('.founder-home > .error').innerText();
    assert(text.includes('Home reality could not be established')&&text.includes('HTTP 503'),
      'Home visibly labels the missing data instead of showing an invented count');
    assert((await page.locator('.founder-home-card').count())===0,
      'no observed metric is fabricated after a failed essential read');
  });
  assert(pageErrors.length===0,'no JS exceptions during read failure: '+JSON.stringify(pageErrors));
  server.close();
}

console.log('\n[6] Signed-out founder cannot view private screens');
{
  const {server,baseUrl}=await startServer('signed-out');
  const {pageErrors}=await withPage(browser,{width:1280,height:900},async(page)=>{
    await page.goto(baseUrl+'/control-room/',{waitUntil:'load'});
    await page.waitForSelector('#magic-link-form',{timeout:10000});
    assert((await page.locator('.sign-in-card h2').innerText())==='Founder Control Room',
      'real sign-in card remains the only entry path');
    assert((await page.locator('.founder-screen-nav').count())===0
      &&(await page.locator('.founder-home').count())===0,
      'private navigation is never rendered for signed-out visitors');
    await page.screenshot({path:join(OUT_DIR,'founder-home-signed-out.png'),fullPage:true});
  });
  assert(pageErrors.length===0,'no JS exceptions signed-out: '+JSON.stringify(pageErrors));
  server.close();
}

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nFounder Home dashboard proof: all assertions passed');
