import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildGoalfixReport } from '../dist/goalfix/engine.js';
import { buildGoalfixSkillRuntimeDecision } from '../dist/goalfix/skillRuntime.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'goalfix');
const SHA = 'abc123abc123abc123abc123abc123abc123abcd';
const REQUIRED_CHECKS = ['Typecheck', 'Product Design Playwright Proof'];
const STOP_CONDITION = 'Stop after the complete named exact-head proof set is classified.';
const requestAttemptCounts = [];
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
    stopCondition: STOP_CONDITION,
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
          || payload.stopCondition !== STOP_CONDITION
          || JSON.stringify(payload.expectedVerificationNames) !== JSON.stringify(REQUIRED_CHECKS)
        ) {
          throw new Error('Proof request did not preserve the founder goal, stop condition, and required check set.');
        }

        const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
        requestAttemptCounts.push(attempts.length);
        const runtimeDecision = buildGoalfixSkillRuntimeDecision({
          intent: { raw: payload.desiredOutcome },
          attempts,
          scope: {
            firstFilesOrLogs: Array.isArray(payload.firstFilesOrLogs) ? payload.firstFilesOrLogs : [],
            maxInitialReads: Number.isInteger(payload.maxInitialReads)
              ? payload.maxInitialReads
              : Math.max(1, Math.min(payload.firstFilesOrLogs?.length || 1, 5)),
            stopCondition: payload.stopCondition,
          },
        });

        if (!runtimeDecision.mayProceed) {
          res.writeHead(409, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({
            error: runtimeDecision.nextAction,
            code: 'GOALFIX_RUNTIME_BLOCKED',
            skillRuntime: runtimeDecision,
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ...report, skillRuntime: runtimeDecision }));
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

async function submitInspection(page) {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().endsWith('/goalfix/inspect')
  ));
  await page.click('#goalfix-submit');
  const response = await responsePromise;
  await page.waitForFunction(() => !document.getElementById('goalfix-submit')?.disabled);
  return response;
}

async function storedAttemptCounts(page) {
  return page.evaluate(() => Object.keys(sessionStorage)
    .filter((item) => item.startsWith('fcr_goalfix_attempts_v1:'))
    .map((key) => {
      try {
        const value = JSON.parse(sessionStorage.getItem(key) ?? '[]');
        return Array.isArray(value) ? value.length : -1;
      } catch {
        return -1;
      }
    })
    .sort((left, right) => left - right));
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
  await page.fill('[name="stopCondition"]', STOP_CONDITION);

  const firstResponse = await submitInspection(page);
  assert(firstResponse.status() === 200, `${name}: first inspection executes`);
  await page.locator('[data-state="blocked"]').waitFor({ state: 'visible' });

  const text = await page.locator('#goalfix-result').innerText();
  assert(text.includes("Se'kret Bip"), `${name}: project identity renders`);
  assert(text.includes(SHA), `${name}: immutable exact head renders`);
  assert(text.includes('L1 · read-only'), `${name}: authority boundary renders`);
  assert(text.includes('Required exact-head checks: Typecheck, Product Design Playwright Proof.'), `${name}: complete named proof set renders`);
  assert(text.includes('Typecheck: passed'), `${name}: passing required proof remains visible`);
  assert(text.includes('Product Design Playwright Proof: failed'), `${name}: failed required proof remains visible`);
  assert(text.includes('NEXT GATE'), `${name}: founder next gate renders`);
  assert(
    JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([2]),
    `${name}: first verification result is retained in the current goal scope`,
  );

  const secondResponse = await submitInspection(page);
  assert(secondResponse.status() === 200, `${name}: second inspection receives accumulated history`);
  assert(
    JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([4]),
    `${name}: second verification result extends bounded history`,
  );

  const thirdResponse = await submitInspection(page);
  assert(thirdResponse.status() === 409, `${name}: third repeated inspection is blocked before provider work`);
  const errorText = await page.locator('#goalfix-message').innerText();
  assert(errorText.includes('Stop retrying the same path'), `${name}: founder sees stagnation reorientation`);
  assert(
    JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([4]),
    `${name}: blocked inspection preserves prior evidence`,
  );

  await page.fill('[name="suspectedFailureArea"]', 'Inspect a different provider evidence lane.');
  const reorientedResponse = await submitInspection(page);
  assert(reorientedResponse.status() === 200, `${name}: changed failure area opens a fresh evidence lane`);
  assert(
    JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([2, 4]),
    `${name}: reoriented lane is isolated from the blocked history`,
  );
  assert(pageErrors.length === 0, `${name}: no uncaught browser errors`);
  assert(failedRequests.length === 0, `${name}: no failed network requests`);

  await page.screenshot({ path: join(ARTIFACT_DIR, `goalfix-${name}.png`), fullPage: true });
  await context.close();
}

try {
  await proveViewport('desktop', { width: 1440, height: 1000 });
  await proveViewport('mobile', { width: 390, height: 844 });
  assert(
    JSON.stringify(requestAttemptCounts) === JSON.stringify([0, 2, 4, 0, 0, 2, 4, 0]),
    'desktop and mobile retain repeated attempts while reoriented scopes start clean',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures > 0) {
  console.error(`Goalfix browser proof failed with ${failures} assertion(s).`);
  process.exitCode = 1;
} else {
  console.log('Goalfix browser proof passed for desktop and mobile, including stagnation and reorientation.');
}
