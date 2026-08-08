import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public');
const outputDir = resolve(here, '../test-results');
const SESSION_KEY = 'fcr_session';
const CONTRACT = 'founder-control-room/n8n-conveyor@v2';
const TOKEN = 'proof-token';

await mkdir(outputDir, { recursive: true });

let readinessState = 'ready-for-probe';
let lastAuthorization = null;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function serveControlRoomAsset(req, res, pathname) {
  const relative = pathname === '/control-room/'
    ? 'control-room/index.html'
    : pathname.replace(/^\//, '');

  if (relative === 'control-room/app.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end('// Focused readiness proof: SPA bootstrap intentionally omitted.');
    return;
  }

  try {
    const filePath = resolve(publicDir, relative);
    if (!filePath.startsWith(publicDir)) throw new Error('invalid path');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (url.pathname === '/automation/conveyor/' || url.pathname === '/automation/conveyor') {
    lastAuthorization = req.headers.authorization ?? null;
    if (lastAuthorization !== `Bearer ${TOKEN}`) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    json(res, 200, {
      contract: CONTRACT,
      stages: ['chat', 'workflows', 'code', 'projects', 'skills'],
      readiness: {
        state: readinessState,
        configured: readinessState !== 'not-configured',
        enabled: readinessState === 'enabled-awaiting-proof',
        liveProbeRequired: true,
        liveVerified: false,
      },
      authority: {
        advanceStage: true,
        merge: false,
        deploy: false,
        publish: false,
        sendExternal: false,
      },
    });
    return;
  }

  if (url.pathname.startsWith('/control-room/')) {
    await serveControlRoomAsset(req, res, url.pathname);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
const address = server.address();
assert(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

await page.addInitScript(({ key, token }) => {
  sessionStorage.setItem(key, JSON.stringify({
    access_token: token,
    refresh_token: '',
    expires_at: null,
    email: 'founder@example.com',
  }));
}, { key: SESSION_KEY, token: TOKEN });

async function expectReadiness(state, label) {
  const status = page.locator('[data-conveyor-readiness]');
  await status.waitFor({ state: 'visible' });
  await page.waitForFunction(
    ({ expectedState, expectedLabel }) => {
      const node = document.querySelector('[data-conveyor-readiness]');
      const text = document.querySelector('[data-conveyor-readiness-label]');
      return node?.getAttribute('data-state') === expectedState && text?.textContent?.trim() === expectedLabel;
    },
    { expectedState: state, expectedLabel: label },
  );
  assert.equal(await status.getAttribute('data-state'), state);
  assert.equal(await page.locator('[data-conveyor-readiness-label]').innerText(), label);
}

try {
  await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'domcontentloaded' });

  // The readiness badge intentionally lives inside the closed founder-stack dock.
  // Open the real dock first, which also triggers a fresh authenticated readiness read.
  await page.locator('.launch-dock > summary').click();
  await expectReadiness('ready-for-probe', 'n8n configured · live probe required');
  assert.equal(lastAuthorization, `Bearer ${TOKEN}`);
  await page.locator('.conveyor-readiness').scrollIntoViewIfNeeded();

  const initialText = await page.locator('.conveyor-readiness').innerText();
  assert.doesNotMatch(initialText, /verified/i);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    dockWidth: document.querySelector('.launch-dock')?.getBoundingClientRect().width ?? 0,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, 'readiness UI must not overflow the mobile viewport');
  assert(dimensions.dockWidth <= dimensions.viewportWidth, 'founder stack dock must fit mobile viewport');

  await page.screenshot({
    path: resolve(outputDir, 'conveyor-readiness-mobile.png'),
    fullPage: true,
  });

  readinessState = 'enabled-awaiting-proof';
  await page.locator('.launch-dock > summary').click();
  await page.locator('.launch-dock > summary').click();
  await expectReadiness('enabled-awaiting-proof', 'n8n enabled · live proof missing');

  readinessState = 'not-configured';
  await page.locator('.launch-dock > summary').click();
  await page.locator('.launch-dock > summary').click();
  await expectReadiness('not-configured', 'n8n not configured');

  const finalText = await page.locator('.conveyor-readiness').innerText();
  assert.doesNotMatch(finalText, /verified/i);

  console.log(JSON.stringify({
    ok: true,
    route: '/control-room/',
    viewport: '390x844',
    contract: CONTRACT,
    provedStates: ['ready-for-probe', 'enabled-awaiting-proof', 'not-configured'],
    authorization: 'Bearer <redacted>',
    screenshot: 'test-results/conveyor-readiness-mobile.png',
    overflow: dimensions,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolvePromise, rejectPromise) => server.close((error) => error ? rejectPromise(error) : resolvePromise()));
}
