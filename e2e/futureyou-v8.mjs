import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PORT = 8810;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CONTROL_ROOM_DIR = fileURLToPath(new URL('../public/control-room/', import.meta.url));
const ARTIFACT_DIR = fileURLToPath(new URL('../artifacts/', import.meta.url));

const brief = {
  version: 'futureyou-v8',
  generatedAt: '2026-07-24T20:00:00.000Z',
  northStar: 'Surface the highest-leverage verified next action without inventing certainty, revenue, or execution authority.',
  operatingContract: {
    futureYou: 'Still usable with dozens of products, repositories, providers, and active opportunities.',
    redTeam: 'Expose blind spots and never present a draft, estimate, or stale record as completed reality.',
    ooda: 'Observe signals, orient by risk and state, decide one next move, act through existing gates, then verify.',
    lindyMode: 'Organize around durable founder decisions rather than whichever provider happens to be connected today.',
    l99: 'Every recommendation declares its authority level and keeps approval boundaries explicit.',
  },
  summary: {
    openMissions: 6,
    waitingDecision: 2,
    highRisk: 1,
    recentCompletions: 1,
    evidenceCoveragePercent: 100,
  },
  priorities: [
    {
      id: 'mission:proof-1',
      source: 'mission',
      project: { slug: 'founder-control-room', name: 'Founder Control Room' },
      title: 'Review payment automation proof',
      domain: 'risk',
      score: 100,
      confidence: 'high',
      reason: 'in review mission · high risk',
      nextAction: 'Decide: inspect the diff, unresolved risks, and proof gate before approving or requesting changes.',
      evidence: [
        'mission status: in_review',
        'risk level: high',
        'last updated: 2026-07-24T18:00:00.000Z',
        'project: founder-control-room',
      ],
      authority: {
        level: 'L3',
        mode: 'decide',
        requiresExplicitApproval: true,
        boundary: 'Review and founder decision only; no merge, send, publish, deploy, or spend action is implied.',
      },
      observedAt: '2026-07-24T18:00:00.000Z',
    },
  ],
  blindSpots: [
    'No verified revenue or expected-value feed is connected to this read model; rankings are operational, not financial forecasts.',
  ],
};

const pluginCenter = {
  contract: {
    enforcementNote: 'Plugin Center is inventory and authority declaration. High-risk execution remains enforced by proof gates, approval execution, provider adapters, and auditable grants.',
  },
  summary: {
    activeTemporaryGrants: 1,
  },
  connections: [
    {
      id: 'fcr-github',
      projectId: 'project-fcr',
      projectSlug: 'founder-control-room',
      projectName: 'Founder Control Room',
      type: 'github',
      status: 'active',
      authorityLevel: 'L5',
      secretRef: 'github/fcr/builder-secret-ref',
    },
    {
      id: 'fcr-cloudflare',
      projectId: 'project-fcr',
      projectSlug: 'founder-control-room',
      projectName: 'Founder Control Room',
      type: 'cloudflare',
      status: 'active',
      authorityLevel: 'L6',
      secretRef: 'cloudflare/fcr/provider-secret-ref',
    },
    {
      id: 'bip-github',
      projectId: 'project-bip',
      projectSlug: 'sekret-bip',
      projectName: 'Se’kret Bip',
      type: 'github',
      status: 'active',
      authorityLevel: 'L4',
      secretRef: 'github/bip/builder-secret-ref',
    },
    {
      id: 'bip-cloudflare',
      projectId: 'project-bip',
      projectSlug: 'sekret-bip',
      projectName: 'Se’kret Bip',
      type: 'cloudflare',
      status: 'active',
      authorityLevel: 'L6',
      secretRef: 'cloudflare/bip/provider-secret-ref',
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

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/futureyou/v8/brief' || request.url === '/plugin-center') {
      if (!request.headers.authorization?.startsWith('Bearer ')) {
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
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('fcr_session', JSON.stringify({
        access_token: 'futureyou-v8-proof-token',
        email: 'founder@example.com',
      }));
    });

    await page.goto(`${BASE_URL}/control-room/futureyou-v8.html`, { waitUntil: 'networkidle' });

    await page.locator('h1', { hasText: 'What matters now.' }).waitFor();
    assert(await page.locator('.priority-card').count() === 1, `${viewport.name}: one governed priority renders`);
    assert(await page.locator('text=L3 · decide').count() === 1, `${viewport.name}: decision authority is visible`);
    assert(await page.locator('text=no merge, send, publish, deploy, or spend action is implied').count() === 1, `${viewport.name}: execution boundary is visible`);
    assert(await page.locator('text=It is not a revenue forecast').count() === 1, `${viewport.name}: financial truth boundary is visible`);
    assert(await page.locator('text=No verified revenue or expected-value feed').count() === 1, `${viewport.name}: missing revenue evidence is exposed`);
    assert(await page.locator('text=Declared autonomy readiness').count() === 1, `${viewport.name}: autonomy readiness section renders`);

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

    const screenshot = join(ARTIFACT_DIR, `futureyou-v8-cockpit-${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    receipts.push({
      viewport,
      screenshot,
      buildReadyProjects: 2,
      integrationReadyProjects: 1,
      providerReadyProjects: 2,
      secretRefsRendered: false,
      pageErrors,
    });
    await page.close();
  }

  await writeFile(
    join(ARTIFACT_DIR, 'futureyou-v8-autonomy-receipt.json'),
    `${JSON.stringify({ schemaVersion: 1, result: 'passed', viewports: receipts }, null, 2)}\n`,
    'utf8',
  );
  console.log('FutureYou V8 autonomy readiness rendered proof passed.');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}