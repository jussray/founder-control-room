import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildGoalfixReport } from '../dist/goalfix/engine.js';
import { buildGoalfixSkillRuntimeDecision } from '../dist/goalfix/skillRuntime.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'goalfix');
const OLD_SHA = 'abc123abc123abc123abc123abc123abc123abcd';
const NEW_SHA = 'fedcba9876543210fedcba9876543210fedcba98';
const REQUIRED_CHECKS = ['Typecheck', 'Product Design Playwright Proof'];
const STOP_CONDITION = 'Stop after the complete named exact-head proof set is classified.';
const SESSION_COOKIE_NAME = '__Host-fcr_session';
const SESSION_COOKIE_VALUE = `v1.${'b'.repeat(43)}`;
const requestAttemptCounts = [];
let currentSha = OLD_SHA;

function normalizeSignalName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizedRequiredNames(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeSignalName).filter(Boolean))].sort();
}

function buildProofReport(commitSha) {
  const unrelatedSignals = Array.from({ length: 25 }, (_, index) => ({
    id: `noise-${index}`,
    name: `Unrelated proof ${index}`,
    status: 'passed',
    commitSha,
    provider: 'github',
  }));

  return buildGoalfixReport({
    project: {
      id: 'project-proof',
      slug: 'sekret-bip',
      name: "Se'kret Bip",
      repository: 'jussray/Sekret-Bip',
      provider: 'github',
    },
    target: { name: 'main', commitSha },
    goal: {
      desiredOutcome: 'Keep the public welcome available before login.',
      reason: 'Preserve a usable front door without weakening protected routes.',
      constraints: ['Read-only inspection', 'No deployment'],
      firstFilesOrLogs: ['app/_layout.tsx', 'Product Design Playwright Proof'],
      expectedVerificationNames: REQUIRED_CHECKS,
      stopCondition: STOP_CONDITION,
    },
    verificationSignals: [
      { id: 'proof-typecheck', name: 'Typecheck', status: 'passed', commitSha, provider: 'github' },
      { id: 'proof-playwright', name: 'Product Design Playwright Proof', status: 'failed', commitSha, provider: 'github' },
      { id: 'proof-playwright-duplicate-suite', name: 'Product Design Playwright Proof', status: 'failed', commitSha, provider: 'github' },
      ...unrelatedSignals,
    ],
    observedAt: new Date('2026-07-27T20:00:00.000Z'),
  });
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
writeFileSync(join(ARTIFACT_DIR, 'goalfix-report.json'), `${JSON.stringify(buildProofReport(OLD_SHA), null, 2)}\n`);

const assets = new Map([
  ['/control-room/goalfix.html', ['text/html; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/goalfix.html'))]],
  ['/control-room/goalfix.js', ['text/javascript; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/goalfix.js'))]],
  ['/control-room/styles.css', ['text/css; charset=utf-8', readFileSync(join(ROOT, 'public/control-room/styles.css'))]],
]);

function hasOpaqueFounderCookie(req) {
  const cookie = req.headers.cookie ?? '';
  return cookie.split(';').some((part) => part.trim() === `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}`);
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && assets.has(req.url)) {
    const [contentType, content] = assets.get(req.url);
    const headers = { 'Content-Type': contentType, 'Cache-Control': 'no-store' };
    if (req.url === '/control-room/goalfix.html') {
      headers['Set-Cookie'] = `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}; Path=/; Secure; HttpOnly; SameSite=Strict`;
    }
    res.writeHead(200, headers);
    res.end(content);
    return;
  }

  if (req.method === 'POST' && req.url === '/goalfix/inspect') {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!hasOpaqueFounderCookie(req) || req.headers.authorization) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Founder session required' }));
        return;
      }
      try {
        const payload = JSON.parse(raw);
        if (
          payload.projectSlug !== 'sekret-bip'
          || !payload.desiredOutcome
          || payload.resolvedIntent !== payload.desiredOutcome
          || payload.stopCondition !== STOP_CONDITION
          || JSON.stringify(normalizedRequiredNames(payload.expectedVerificationNames)) !== JSON.stringify(normalizedRequiredNames(REQUIRED_CHECKS))
        ) {
          throw new Error('Proof request did not preserve the confirmed founder goal, stop condition, and required check set.');
        }

        const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
        requestAttemptCounts.push(attempts.length);
        const runtimeInput = {
          intent: { raw: payload.desiredOutcome, resolved: payload.resolvedIntent },
          scope: {
            firstFilesOrLogs: Array.isArray(payload.firstFilesOrLogs) ? payload.firstFilesOrLogs : [],
            maxInitialReads: Number.isInteger(payload.maxInitialReads)
              ? payload.maxInitialReads
              : Math.max(1, Math.min(payload.firstFilesOrLogs?.length || 1, 5)),
            stopCondition: payload.stopCondition,
          },
        };
        const preflightDecision = buildGoalfixSkillRuntimeDecision({ ...runtimeInput, attempts: [] });
        if (!preflightDecision.mayProceed) {
          res.writeHead(409, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: preflightDecision.nextAction, code: 'GOALFIX_RUNTIME_BLOCKED', skillRuntime: preflightDecision }));
          return;
        }

        const requiredNames = new Set(REQUIRED_CHECKS.map(normalizeSignalName));
        const exactHeadAttempts = attempts.filter((attempt) => (
          attempt?.commitSha === currentSha && requiredNames.has(normalizeSignalName(attempt?.verificationName))
        ));
        const runtimeDecision = buildGoalfixSkillRuntimeDecision({ ...runtimeInput, attempts: exactHeadAttempts });
        if (!runtimeDecision.mayProceed) {
          res.writeHead(409, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({
            error: runtimeDecision.nextAction,
            code: 'GOALFIX_RUNTIME_BLOCKED',
            skillRuntime: runtimeDecision,
            target: { name: 'main', commitSha: currentSha },
          }));
          return;
        }

        const report = buildProofReport(currentSha);
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
    response.request().method() === 'POST' && response.url().endsWith('/goalfix/inspect')
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
  currentSha = OLD_SHA;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  const failedRequests = [];
  const authorizationHeaders = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}`));
  page.on('request', (request) => {
    if (request.url().endsWith('/goalfix/inspect')) authorizationHeaders.push(request.headers().authorization ?? null);
  });

  await page.goto(`${baseUrl}/control-room/goalfix.html`, { waitUntil: 'networkidle' });
  await page.fill('[name="desiredOutcome"]', 'Keep the public welcome available before login.');
  await page.check('[name="intentConfirmed"]');
  await page.fill('[name="reason"]', 'Preserve the front door without weakening protected routes.');
  await page.fill('[name="constraints"]', 'Read-only inspection\nNo deployment');
  await page.fill('[name="firstFilesOrLogs"]', 'app/_layout.tsx\nProduct Design Playwright Proof');
  await page.fill('[name="expectedVerificationNames"]', REQUIRED_CHECKS.join('\n'));
  await page.fill('[name="stopCondition"]', STOP_CONDITION);

  const firstResponse = await submitInspection(page);
  assert(firstResponse.status() === 200, `${name}: confirmed first inspection executes through opaque founder cookie`);
  await page.locator('[data-state="blocked"]').waitFor({ state: 'visible' });

  const text = await page.locator('#goalfix-result').innerText();
  assert(text.includes("Se'kret Bip"), `${name}: project identity renders`);
  assert(text.includes(OLD_SHA), `${name}: immutable exact head renders`);
  assert(text.includes('L1 · read-only'), `${name}: authority boundary renders`);
  assert(text.includes('Required exact-head checks: Typecheck, Product Design Playwright Proof.'), `${name}: complete named proof set renders`);
  assert(text.includes('Typecheck: passed'), `${name}: passing required proof remains visible`);
  assert(text.includes('Product Design Playwright Proof: failed'), `${name}: failed required proof remains visible`);
  assert(text.includes('Unrelated proof 24: passed'), `${name}: provider proof noise remains visible in the report`);
  assert(text.includes('NEXT GATE'), `${name}: founder next gate renders`);
  assert(JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([2]), `${name}: duplicate suites collapse to one observation per required check`);

  const secondResponse = await submitInspection(page);
  assert(secondResponse.status() === 200, `${name}: second inspection receives accumulated exact-head history`);
  assert(JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([4]), `${name}: second inspection adds one observation per required check`);

  await page.fill('[name="expectedVerificationNames"]', [...REQUIRED_CHECKS].reverse().join('\n'));
  const thirdResponse = await submitInspection(page);
  assert(thirdResponse.status() === 409, `${name}: third repeated same-head inspection is blocked`);
  const errorText = await page.locator('#goalfix-message').innerText();
  assert(errorText.includes('Stop retrying the same path'), `${name}: founder sees stagnation reorientation`);
  assert(JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([4]), `${name}: blocked inspection preserves prior evidence`);

  currentSha = NEW_SHA;
  const advancedHeadResponse = await submitInspection(page);
  assert(advancedHeadResponse.status() === 200, `${name}: advancing main opens the repaired exact head`);
  const advancedText = await page.locator('#goalfix-result').innerText();
  assert(advancedText.includes(NEW_SHA), `${name}: new immutable head replaces the stale ref result`);
  assert(JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([6]), `${name}: old and new heads remain bounded per required check`);

  await page.fill('[name="suspectedFailureArea"]', 'Inspect a different provider evidence lane.');
  const reorientedResponse = await submitInspection(page);
  assert(reorientedResponse.status() === 200, `${name}: changed failure area opens a fresh evidence lane`);
  assert(JSON.stringify(await storedAttemptCounts(page)) === JSON.stringify([2, 6]), `${name}: reoriented lane is isolated from earlier history`);
  assert(pageErrors.length === 0, `${name}: no uncaught browser errors`);
  assert(failedRequests.length === 0, `${name}: no failed network requests`);
  assert(authorizationHeaders.every((value) => value === null), `${name}: no browser bearer header is sent`);
  assert(await page.evaluate(() => !sessionStorage.getItem('fcr_session')), `${name}: browser-readable founder credentials remain absent`);

  await page.screenshot({ path: join(ARTIFACT_DIR, `goalfix-${name}.png`), fullPage: true });
  await context.close();
}

try {
  await proveViewport('desktop', { width: 1440, height: 1000 });
  await proveViewport('mobile', { width: 390, height: 844 });
  assert(
    JSON.stringify(requestAttemptCounts) === JSON.stringify([0, 2, 4, 4, 0, 0, 2, 4, 4, 0]),
    'desktop and mobile bind deduplicated attempts to exact heads while fresh scopes start clean',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures > 0) {
  console.error(`Goalfix browser proof failed with ${failures} assertion(s).`);
  process.exitCode = 1;
} else {
  console.log('Goalfix browser proof passed for desktop and mobile with opaque-cookie auth, duplicate-suite collapse, exact-head recovery, and bounded required-check history.');
}
