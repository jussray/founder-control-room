import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PORT = 8810;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CONTROL_ROOM_DIR = fileURLToPath(new URL('../public/control-room/', import.meta.url));
const ARTIFACT_DIR = fileURLToPath(new URL('../artifacts/', import.meta.url));
const SESSION_COOKIE_NAME = '__Host-fcr_session';
const SESSION_COOKIE_VALUE = `v1.${'a'.repeat(43)}`;

const brief = {
  version: 'futureyou-v8',
  generatedAt: '2026-07-24T20:00:00.000Z',
  northStar: 'Surface the highest-leverage verified next action without inventing certainty, revenue, or execution authority.',
  operatingContract: {
    futureYou: 'Still usable with dozens of products, repositories, providers, and active opportunities.',
    redTeam: 'Expose blind spots and never present a draft, estimate, malformed timestamp, future-dated signal, or stale record as fresh completed reality.',
    ooda: 'Observe trustworthy signals, orient by risk and state, decide one next move, act through existing gates, then verify.',
    lindyMode: 'Organize around durable founder decisions and explicit evidence freshness rather than whichever provider happens to be connected today.',
    l99: 'Every recommendation declares its authority level and keeps approval boundaries explicit.',
  },
  summary: {
    openMissions: 6,
    waitingDecision: 2,
    highRisk: 1,
    recentCompletions: 1,
    evidenceCoveragePercent: 100,
    trustedObservationPercent: 75,
    staleObservations: 1,
    invalidObservationTimes: 1,
    futureObservationTimes: 0,
  },
  priorities: [{
    id: 'mission:proof-1',
    source: 'mission',
    project: { slug: 'founder-control-room', name: 'Founder Control Room' },
    title: 'Review payment automation proof',
    domain: 'risk',
    score: 100,
    confidence: 'high',
    observationState: 'fresh',
    reason: 'in review mission · high risk',
    nextAction: 'Decide: inspect the diff, unresolved risks, and proof gate before approving or requesting changes.',
    evidence: [
      'mission status: in_review',
      'risk level: high',
      'last updated: 2026-07-24T18:00:00.000Z',
      'observation state: fresh',
      'project: founder-control-room',
    ],
    authority: {
      level: 'L3',
      mode: 'decide',
      requiresExplicitApproval: true,
      boundary: 'Review and founder decision only; no merge, send, publish, deploy, or spend action is implied.',
    },
    observedAt: '2026-07-24T18:00:00.000Z',
  }],
  blindSpots: [
    '1 observation is at least 3 days old and cannot count as fresh decision evidence.',
    '1 record has an invalid observation time; machine confidence is forced low.',
    'No verified revenue or expected-value feed is connected to this read model; rankings are operational, not financial forecasts.',
  ],
};

const pluginCenter = {
  contract: {
    enforcementNote: 'Plugin Center is inventory and authority declaration. High-risk execution remains enforced by proof gates, approval execution, provider adapters, and auditable grants.',
  },
  summary: { activeTemporaryGrants: 1 },
  connections: [
    {
      id: 'fcr-github', projectId: 'project-fcr', projectSlug: 'founder-control-room', projectName: 'Founder Control Room',
      type: 'github', status: 'active', authorityLevel: 'L5',
      capabilities: ['inspect_repos', 'create_branch', 'integrate_main'], secretRef: 'github/fcr/builder-secret-ref',
    },
    {
      id: 'fcr-cloudflare', projectId: 'project-fcr', projectSlug: 'founder-control-room', projectName: 'Founder Control Room',
      type: 'cloudflare', status: 'active', authorityLevel: 'L6',
      capabilities: ['inspect_operational_data', 'deploy'], secretRef: 'cloudflare/fcr/provider-secret-ref',
    },
    {
      id: 'bip-github', projectId: 'project-bip', projectSlug: 'sekret-bip', projectName: 'Se’kret Bip',
      type: 'github', status: 'active', authorityLevel: 'L4',
      capabilities: ['inspect_repos', 'create_branch'], secretRef: 'github/bip/builder-secret-ref',
    },
    {
      id: 'bip-cloudflare', projectId: 'project-bip', projectSlug: 'sekret-bip', projectName: 'Se’kret Bip',
      type: 'cloudflare', status: 'active', authorityLevel: 'L6',
      capabilities: ['inspect_operational_data', 'deploy'], secretRef: 'cloudflare/bip/provider-secret-ref',
    },
  ],
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok: ${message}`);
}

function hasOpaqueFounderCookie(request) {
  const cookie = request.headers.cookie ?? '';
  return cookie.split(';').some((part) => part.trim() === `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}`);
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/futureyou/v8/brief' || request.url === '/plugin-center') {
      if (!hasOpaqueFounderCookie(request) || request.headers.authorization) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Founder session required' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(request.url === '/plugin-center' ? pluginCenter : brief));
      return;
    }

    const pathname = request.url === '/' ? '/control-room/futureyou-v8.html' : request.url ?? '';
    if (!pathname.startsWith('/control-room/')) {
      response.writeHead(404).end('Not found');
      return;
    }
    const relativePath = normalize(pathname.slice('/control-room/'.length));
    if (relativePath.startsWith('..')) {
      response.writeHead(400).end('Invalid path');
      return;
    }
    const filePath = join(CONTROL_ROOM_DIR, relativePath);
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
await mkdir(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const receipts = [];
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1100 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    await context.addCookies([{
      name: SESSION_COOKIE_NAME,
      value: SESSION_COOKIE_VALUE,
      url: BASE_URL,
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    }]);
    const page = await context.newPage();
    const pageErrors = [];
    const authHeaders = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/futureyou/v8/brief') || request.url().endsWith('/plugin-center')) {
        authHeaders.push(request.headers().authorization ?? null);
      }
    });

    await page.goto(`${BASE_URL}/control-room/futureyou-v8.html`, { waitUntil: 'networkidle' });

    await page.locator('h1', { hasText: 'What matters now.' }).waitFor();
    assert(await page.locator('.priority-card').count() === 1, `${viewport.name}: one governed priority renders`);
    assert(await page.locator('text=L3 · decide').count() === 1, `${viewport.name}: decision authority is visible`);
    assert(await page.locator('text=high confidence').count() === 1, `${viewport.name}: machine confidence is visible`);
    assert(await page.locator('text=fresh evidence').count() === 1, `${viewport.name}: observation trust is visible`);
    assert(await page.locator('text=no merge, send, publish, deploy, or spend action is implied').count() === 1, `${viewport.name}: execution boundary is visible`);
    assert(await page.locator('text=It is not a revenue forecast').count() === 1, `${viewport.name}: financial truth boundary is visible`);
    assert(await page.locator('text=No verified revenue or expected-value feed').count() === 1, `${viewport.name}: missing revenue evidence is exposed`);
    assert(await page.locator('text=invalid observation time').count() === 1, `${viewport.name}: time-integrity blind spot is exposed`);
    assert(await page.locator('text=Declared autonomy readiness').count() === 1, `${viewport.name}: autonomy readiness section renders`);

    const trustedMetric = page.locator('.metric', { hasText: 'Trusted observations' });
    const staleMetric = page.locator('.metric', { hasText: 'Stale observations' });
    const timeGapMetric = page.locator('.metric', { hasText: 'Time integrity gaps' });
    assert((await trustedMetric.locator('strong').textContent())?.trim() === '75%', `${viewport.name}: trusted observation percentage is visible`);
    assert((await staleMetric.locator('strong').textContent())?.trim() === '1', `${viewport.name}: stale observation count is visible`);
    assert((await timeGapMetric.locator('strong').textContent())?.trim() === '1', `${viewport.name}: time integrity gaps are visible`);

    const buildMetric = page.locator('.metric', { hasText: 'Build-ready projects' });
    const integrationMetric = page.locator('.metric', { hasText: 'Integration-ready' });
    const providerMetric = page.locator('.metric', { hasText: 'Provider-ready' });
    assert((await buildMetric.locator('strong').textContent())?.trim() === '2', `${viewport.name}: two projects are build-ready`);
    assert((await integrationMetric.locator('strong').textContent())?.trim() === '1', `${viewport.name}: one project is integration-ready`);
    assert((await providerMetric.locator('strong').textContent())?.trim() === '2', `${viewport.name}: two projects are provider-ready`);
    assert(await page.locator('text=Founder Control Room').count() >= 1, `${viewport.name}: FCR autonomy lane renders`);
    assert(await page.locator('text=Se’kret Bip').count() >= 1, `${viewport.name}: Se’kret Bip autonomy lane renders`);
    assert(await page.locator('text=Credential values are never rendered here').count() === 1, `${viewport.name}: credential rendering boundary is visible`);

    const visibleText = await page.locator('body').innerText();
    assert(!visibleText.includes('$'), `${viewport.name}: cockpit does not invent a dollar value`);
    assert(!visibleText.includes('conversion probability'), `${viewport.name}: cockpit does not invent conversion probability`);
    for (const secretRef of [
      'github/fcr/builder-secret-ref',
      'cloudflare/fcr/provider-secret-ref',
      'github/bip/builder-secret-ref',
      'cloudflare/bip/provider-secret-ref',
    ]) {
      assert(!visibleText.includes(secretRef), `${viewport.name}: secret reference value is not rendered`);
    }
    assert(pageErrors.length === 0, `${viewport.name}: no page errors`);
    assert(authHeaders.every((value) => value === null), `${viewport.name}: opaque session sends no browser bearer header`);
    assert(await page.evaluate(() => !sessionStorage.getItem('fcr_session')), `${viewport.name}: no browser-readable founder token is required`);

    const screenshot = join(ARTIFACT_DIR, `futureyou-v8-cockpit-${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    receipts.push({
      viewport,
      screenshot,
      trustedObservationPercent: 75,
      staleObservations: 1,
      timeIntegrityGaps: 1,
      buildReadyProjects: 2,
      integrationReadyProjects: 1,
      providerReadyProjects: 2,
      secretRefsRendered: false,
      browserBearerHeaderSent: false,
      pageErrors,
    });
    await context.close();
  }

  await writeFile(
    join(ARTIFACT_DIR, 'futureyou-v8-autonomy-receipt.json'),
    `${JSON.stringify({ schemaVersion: 3, result: 'passed', auth: 'opaque-http-only-cookie', viewports: receipts }, null, 2)}\n`,
    'utf8',
  );
  console.log('FutureYou V8 observation-trust, autonomy readiness, and opaque-session rendered proof passed.');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
