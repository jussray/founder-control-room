import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildGoalfixReport } from '../dist/goalfix/engine.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'goalfix');
const SHA = 'abc123abc123abc123abc123abc123abc123abcd';
const REQUIRED_CHECKS = ['Typecheck', 'Product Design Playwright Proof'];
const report = buildGoalfixReport({
  project: {
    id: 'project-proof',
    slug: 'sekret-bip',
    name: "Se'kret Bip",
    repository: 'jussray/Sekret-Bip',
    provider: 'github',
  },
  target: { name: 'main', commitSha: SHA },
  goal: {
    desiredOutcome: 'Keep the public welcome available before login.',
    reason: 'Preserve a usable front door without weakening protected routes.',
    constraints: ['Read-only inspection', 'No deployment'],
    firstFilesOrLogs: ['app/_layout.tsx', 'Product Design Playwright Proof'],
    expectedVerificationNames: REQUIRED_CHECKS,
    stopCondition: 'Stop before mutation.',
  },
  verificationSignals: [
    {
      id: 'proof-typecheck',
      name: 'Typecheck',
      status: 'passed',
      commitSha: SHA,
      provider: 'github',
    },
    {
      id: 'proof-playwright',
      name: 'Product Design Playwright Proof',
      status: 'failed',
      commitSha: SHA,
      provider: 'github',
    },
  ],
  observedAt: new Date('2026-07-27T20:00:00.000Z'),
});

mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(join(ARTIFACT_DIR, 'goalfix-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const assets = new Map([
  ['/control-room/goalfix.html', ['text/html; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/goalfix.html'))]],
  ['/control-room/goalfix.js', ['text/javascript; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/goalfix.js'))]],
  ['/control-room/styles.css', ['text/css; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/styles.css'))]],
]);

const server = createServer((req, res) => {
  if (req.method === 'GET' && assets.has(req.url)) {
    const [contentType, content] = assets.get(req.url);
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    res.end(content);
    return;
  }

  if (req.method === 'POST' && req.url === '/goalfix/inspect') {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const authorization = req.headers.authorization ?? '';
      if (authorization !== 'Bearer proof-token') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Founder session required' }));
        return;
      }
      try {
        const payload = JSON.parse(raw);
        if (
          payload.projectSlug !== 'sekret-bip'
          || !payload.desiredOutcome
          || JSON.stringify(payload.expectedVerificationNames) !== JSON.stringify(REQUIRED_CHECKS)
        ) {
          throw new Error('Proof request did not preserve the founder goal and required check set.');
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(report));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve Goalfix proof server address.');
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let failures = 0;

function assert(condition, message) {
  if (condition) console.log(`  ok — ${message}`);
  else {
    failures += 1;
    console.error(`  FAIL — ${message}`);
  }
}

async function proveViewport(name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  await page.addInitScript(() => {
    sessionStorage.setItem('fcr_session', JSON.stringify({
      access_token: 'proof-token',
      refresh_token: '',
      expires_at: null,
      email: 'founder@example.com',
    }));
  });

  await page.goto(`${baseUrl}/control-room/goalfix.html`, { waitUntil: 'networkidle' });
  await page.fill('[name="desiredOutcome"]', 'Keep the public welcome available before login.');
  await page.fill('[name="reason"]', 'Preserve the front door without weakening protected routes.');
  await page.fill('[name="constraints"]', 'Read-only inspection\nNo deployment');
  await page.fill('[name="firstFilesOrLogs"]', 'app/_layout.tsx\nProduct Design Playwright Proof');
  await page.fill('[name="expectedVerificationNames"]', REQUIRED_CHECKS.join('\n'));
  await page.click('#goalfix-submit');
  await page.locator('[data-state="blocked"]').waitFor({ state: 'visible' });

  const text = await page.locator('#goalfix-result').innerText();
  assert(text.includes("Se'kret Bip"), `${name}: project identity renders`);
  assert(text.includes(SHA), `${name}: immutable exact head renders`);
  assert(text.includes('L1 · read-only'), `${name}: authority boundary renders`);
  assert(text.includes('Required exact-head checks: Typecheck, Product Design Playwright Proof.'), `${name}: complete named proof set renders`);
  assert(text.includes('Typecheck: passed'), `${name}: passing required proof remains visible`);
  assert(text.includes('Product Design Playwright Proof: failed'), `${name}: failed required proof remains visible`);
  assert(text.includes('NEXT GATE'), `${name}: founder next gate renders`);
  assert(pageErrors.length === 0, `${name}: no uncaught browser errors`);
  assert(failedRequests.length === 0, `${name}: no failed network requests`);

  await page.screenshot({ path: join(ARTIFACT_DIR, `goalfix-${name}.png`), fullPage: true });
  await context.close();
}

try {
  await proveViewport('desktop', { width: 1440, height: 1000 });
  await proveViewport('mobile', { width: 390, height: 844 });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures > 0) {
  console.error(`Goalfix browser proof failed with ${failures} assertion(s).`);
  process.exitCode = 1;
} else {
  console.log('Goalfix browser proof passed for desktop and mobile.');
}
