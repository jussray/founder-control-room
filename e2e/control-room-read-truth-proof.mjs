import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT = join(REPO_ROOT, 'public');
const RESULTS_ROOT = join(REPO_ROOT, 'test-results');
const serverRequests = [];

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const relative = url.pathname === '/control-room/'
    ? 'control-room/index.html'
    : url.pathname.replace(/^\/+/, '');
  const filePath = normalize(join(PUBLIC_ROOT, relative));
  serverRequests.push(`${req.method ?? 'GET'} ${url.pathname}`);

  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Static proof server did not bind');
const BASE_URL = `http://127.0.0.1:${address.port}`;

let projectReadMode = 'fail';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const pageErrors = [];
const requestFailures = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  requestFailures.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? 'unknown failure'}`);
});

await page.route(`${BASE_URL}/**`, async (route) => {
  const request = route.request();
  const url = new URL(request.url());

  if (url.pathname.startsWith('/control-room/')) {
    await route.continue();
    return;
  }

  if (request.method() === 'GET' && url.pathname === '/projects') {
    if (projectReadMode === 'fail') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'proof fixture: project authority unavailable' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    }
    return;
  }

  const bootFixtures = new Map([
    ['/dashboard/tasks', { tasks: [] }],
    ['/dashboard/activity', { activity: [] }],
    ['/l99/status', { error: 'not exercised by this proof' }],
    ['/promptos', { templates: [] }],
    ['/dashboard/costs', { totalUsd: 0, byAgent: [] }],
    ['/agents', { agents: [] }],
    ['/authority-levels', { levels: [] }],
    ['/integrations/n8n/readiness', { state: 'not-configured' }],
  ]);

  const fixture = bootFixtures.get(url.pathname) ?? {};
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture),
  });
});

async function waitForFounderProjects(label) {
  try {
    await page.locator('.founder-email').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#project-list').waitFor({ state: 'visible', timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      readyState: document.readyState,
      href: location.href,
      bodyText: document.body?.innerText?.slice(0, 800) ?? null,
      scripts: Array.from(document.scripts).map((script) => script.src),
    })).catch(() => null);
    throw new Error(`${label} did not reach founder Projects readiness: ${error instanceof Error ? error.message : String(error)} diagnostic=${JSON.stringify(diagnostic)} serverRequests=${JSON.stringify(serverRequests)} requestFailures=${JSON.stringify(requestFailures)} pageErrors=${JSON.stringify(pageErrors)}`);
  }
}

try {
  mkdirSync(RESULTS_ROOT, { recursive: true });

  const founderFragment = new URLSearchParams({
    access_token: 'proof-token',
    refresh_token: '',
    expires_at: '4102444800',
    email: 'founder@example.com',
  });
  await page.goto(`${BASE_URL}/control-room/#${founderFragment.toString()}`, {
    waitUntil: 'commit',
    timeout: 10_000,
  });
  await waitForFounderProjects('failed-read boot');

  await page.screenshot({
    path: join(RESULTS_ROOT, 'control-room-projects-failed-read-mobile.png'),
    fullPage: true,
  });

  const shellState = await page.evaluate(() => ({
    sessionPresent: Boolean(sessionStorage.getItem('fcr_session')),
    projectListPresent: Boolean(document.querySelector('#project-list')),
    founderEmail: document.querySelector('.founder-email')?.textContent ?? null,
    bodyText: document.body.innerText.slice(0, 600),
    readTruth: window.__FCR_READ_TRUTH__?.projects?.() ?? null,
  }));
  console.log('founder-shell snapshot', JSON.stringify(shellState));

  if (!shellState.sessionPresent || shellState.founderEmail !== 'founder@example.com') {
    throw new Error(`Canonical founder session handoff did not reach the shell: ${JSON.stringify(shellState)}`);
  }
  if (!shellState.projectListPresent) {
    throw new Error(`Founder shell rendered without the Projects surface: ${JSON.stringify(shellState)} pageErrors=${JSON.stringify(pageErrors)}`);
  }

  const failedSnapshot = shellState.readTruth;
  const unknown = page.locator('[data-read-truth="projects-unknown"]');
  await unknown.waitFor({ state: 'visible', timeout: 10_000 });
  const unknownText = await unknown.innerText();

  if (!unknownText.includes('UNKNOWN')) {
    throw new Error(`Failed read did not render UNKNOWN truth: ${unknownText}`);
  }
  if ((await page.locator('#project-list').innerText()).includes('No projects registered yet.')) {
    throw new Error('Failed authoritative read was mislabeled as a verified empty project registry');
  }
  if (failedSnapshot?.state !== 'error' || failedSnapshot?.httpStatus !== 503) {
    throw new Error(`Read-truth diagnostic mismatch after failure: ${JSON.stringify(failedSnapshot)}`);
  }
  await page.screenshot({
    path: join(RESULTS_ROOT, 'control-room-projects-unknown-mobile.png'),
    fullPage: true,
  });

  projectReadMode = 'ready-empty';
  serverRequests.length = 0;
  requestFailures.length = 0;
  await page.reload({ waitUntil: 'commit', timeout: 10_000 });
  await waitForFounderProjects('verified-empty reload');
  const readyText = await page.locator('#project-list').innerText();
  if (!readyText.includes('No projects registered yet.')) {
    throw new Error(`Verified successful empty read did not render the empty state: ${readyText}`);
  }
  if ((await page.locator('[data-read-truth="projects-unknown"]').count()) !== 0) {
    throw new Error('Successful empty read remained mislabeled UNKNOWN');
  }
  const readySnapshot = await page.evaluate(() => window.__FCR_READ_TRUTH__?.projects?.());
  if (readySnapshot?.state !== 'ready' || readySnapshot?.httpStatus !== 200) {
    throw new Error(`Read-truth diagnostic mismatch after successful empty read: ${JSON.stringify(readySnapshot)}`);
  }
  await page.screenshot({
    path: join(RESULTS_ROOT, 'control-room-projects-verified-empty-mobile.png'),
    fullPage: true,
  });

  if (pageErrors.length > 0) {
    throw new Error(`Unexpected browser page errors: ${pageErrors.join(' | ')}`);
  }
  if (requestFailures.length > 0) {
    throw new Error(`Unexpected browser request failures: ${requestFailures.join(' | ')}`);
  }

  console.log('PASS: failed project reads render UNKNOWN; successful empty reads render verified empty state.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
