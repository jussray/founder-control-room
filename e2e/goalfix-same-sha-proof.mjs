import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildGoalfixReport } from '../dist/goalfix/engine.js';
import { buildGoalfixSkillRuntimeDecision } from '../dist/goalfix/skillRuntime.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'goalfix');
const SHA = 'abc123abc123abc123abc123abc123abc123abcd';
const STOP_CONDITION = 'Stop after Playwright reaches a terminal exact-head result.';
const requestAttemptCounts = [];
let liveStatus = 'failed';

mkdirSync(ARTIFACT_DIR, { recursive: true });

const assets = new Map([
  ['/control-room/goalfix.html', ['text/html; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/goalfix.html'))]],
  ['/control-room/goalfix.js', ['text/javascript; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/goalfix.js'))]],
  ['/control-room/styles.css', ['text/css; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/styles.css'))]],
]);

function reportFor(status) {
  return buildGoalfixReport({
    project: {
      id: 'project-proof',
      slug: 'sekret-bip',
      name: "Se'kret Bip",
      repository: 'jussray/Sekret-Bip',
      provider: 'github',
    },
    target: { name: 'main', commitSha: SHA },
    goal: {
      desiredOutcome: 'Recheck the same commit after Playwright is repaired.',
      constraints: ['Read-only inspection'],
      firstFilesOrLogs: ['Playwright artifact'],
      expectedVerificationNames: ['Playwright'],
      stopCondition: STOP_CONDITION,
    },
    verificationSignals: [{
      id: `playwright-${status}`,
      name: 'Playwright',
      status,
      commitSha: SHA,
      provider: 'github',
    }],
  });
}

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
      try {
        const payload = JSON.parse(raw);
        const attempts = Array.isArray(payload.attempts)
          ? payload.attempts.filter((attempt) => (
              attempt?.commitSha === SHA
              && String(attempt?.verificationName).toLowerCase() === 'playwright'
            ))
          : [];
        requestAttemptCounts.push(attempts.length);

        const refreshedAttempts = liveStatus === 'failed' ? attempts : [];
        const decision = buildGoalfixSkillRuntimeDecision({
          intent: {
            raw: payload.desiredOutcome,
            resolved: payload.resolvedIntent,
          },
          attempts: refreshedAttempts,
          scope: {
            firstFilesOrLogs: payload.firstFilesOrLogs ?? [],
            maxInitialReads: 1,
            stopCondition: payload.stopCondition ?? '',
          },
        });

        if (!decision.mayProceed) {
          res.writeHead(409, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({
            error: decision.nextAction,
            code: 'GOALFIX_RUNTIME_BLOCKED',
            skillRuntime: decision,
            target: { name: 'main', commitSha: SHA },
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ...reportFor(liveStatus), skillRuntime: decision }));
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

async function submit(page) {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().endsWith('/goalfix/inspect')
  ));
  await page.click('#goalfix-submit');
  const response = await responsePromise;
  await page.waitForFunction(() => !document.getElementById('goalfix-submit')?.disabled);
  return response;
}

async function storedCount(page) {
  return page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((item) => item.startsWith('fcr_goalfix_attempts_v1:'));
    if (!key) return 0;
    const value = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.length : -1;
  });
}

async function proveViewport(name, viewport) {
  liveStatus = 'failed';
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('fcr_session', JSON.stringify({
      access_token: 'proof-token',
      email: 'founder@example.com',
    }));
  });

  await page.goto(`${baseUrl}/control-room/goalfix.html`, { waitUntil: 'networkidle' });
  await page.fill('[name="desiredOutcome"]', 'Recheck the same commit after Playwright is repaired.');
  await page.check('[name="intentConfirmed"]');
  await page.fill('[name="firstFilesOrLogs"]', 'Playwright artifact');
  await page.fill('[name="expectedVerificationNames"]', 'Playwright');
  await page.fill('[name="stopCondition"]', STOP_CONDITION);

  const first = await submit(page);
  assert(first.status() === 200, `${name}: first failed inspection returns evidence`);
  assert(await storedCount(page) === 1, `${name}: first failure is retained`);

  const second = await submit(page);
  assert(second.status() === 200, `${name}: second failed inspection returns evidence`);
  assert(await storedCount(page) === 2, `${name}: second failure is retained`);

  liveStatus = 'passed';
  const recovered = await submit(page);
  assert(recovered.status() === 200, `${name}: live pass reopens the same SHA`);
  await page.locator('[data-state="ready_for_founder_decision"]').waitFor({ state: 'visible' });
  const text = await page.locator('#goalfix-result').innerText();
  assert(text.includes(`Playwright: passed at ${SHA}`), `${name}: recovered exact-head proof renders`);
  assert(await storedCount(page) === 3, `${name}: pass is retained after the two failures`);

  await page.screenshot({
    path: join(ARTIFACT_DIR, `goalfix-same-sha-${name}.png`),
    fullPage: true,
  });
  await context.close();
}

try {
  await proveViewport('desktop', { width: 1440, height: 1000 });
  await proveViewport('mobile', { width: 390, height: 844 });
  assert(
    JSON.stringify(requestAttemptCounts) === JSON.stringify([0, 1, 2, 0, 1, 2]),
    'desktop and mobile preserve the expected same-SHA attempt sequence',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures > 0) {
  console.error(`Goalfix same-SHA browser proof failed with ${failures} assertion(s).`);
  process.exitCode = 1;
} else {
  console.log('Goalfix same-SHA browser proof passed for desktop and mobile.');
}
