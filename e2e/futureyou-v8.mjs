import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok — ${message}`);
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === '/futureyou/v8/brief') {
      if (!request.headers.authorization?.startsWith('Bearer ')) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Founder session required' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(brief));
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.addInitScript(() => {
    sessionStorage.setItem('fcr_session', JSON.stringify({
      access_token: 'futureyou-v8-proof-token',
      email: 'founder@example.com',
    }));
  });

  await page.goto(`${BASE_URL}/control-room/futureyou-v8.html`, { waitUntil: 'networkidle' });

  await page.locator('h1', { hasText: 'What matters now.' }).waitFor();
  assert(await page.locator('.priority-card').count() === 1, 'one governed priority renders');
  assert(await page.locator('text=L3 · decide').count() === 1, 'L99 decision authority is visible');
  assert(await page.locator('text=no merge, send, publish, deploy, or spend action is implied').count() === 1, 'execution boundary is visible');
  assert(await page.locator('text=It is not a revenue forecast').count() === 1, 'financial truth boundary is visible');
  assert(await page.locator('text=No verified revenue or expected-value feed').count() === 1, 'missing revenue evidence is exposed');
  assert(await page.locator('text=Evidence coverage').count() === 1, 'evidence coverage metric renders');

  const visibleText = await page.locator('body').innerText();
  assert(!visibleText.includes('$'), 'cockpit does not invent a dollar value');
  assert(!visibleText.includes('conversion probability'), 'cockpit does not invent conversion probability');

  await page.screenshot({
    path: join(ARTIFACT_DIR, 'futureyou-v8-cockpit.png'),
    fullPage: true,
  });
  console.log('FutureYou V8 rendered cockpit proof passed.');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
