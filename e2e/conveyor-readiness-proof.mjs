import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public');
const outputDir = resolve(here, '../test-results');
const CONTRACT = 'founder-control-room/n8n-conveyor@v3';
const SESSION_COOKIE = 'fcr-proof-session';
const SESSION_VALUE = 'proof-session';
const EXACT_SHA = 'a'.repeat(40);
const STALE_SHA = 'b'.repeat(40);

await mkdir(outputDir, { recursive: true });

let readinessState = 'ready-for-probe';
let proofState = 'not-observed';
let proofHead = null;
let lastAuthorization = null;
let lastCookie = null;

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

function hasOpaqueProofSession(req) {
  const cookie = req.headers.cookie ?? '';
  return cookie.split(';').some((entry) => entry.trim() === `${SESSION_COOKIE}=${SESSION_VALUE}`);
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

  if (url.pathname === '/auth/me') {
    if (!hasOpaqueProofSession(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    json(res, 200, {
      success: true,
      data: { founder: { email: 'founder@example.com' } },
    });
    return;
  }

  if (url.pathname === '/automation/conveyor/' || url.pathname === '/automation/conveyor') {
    lastAuthorization = req.headers.authorization ?? null;
    lastCookie = req.headers.cookie ?? null;
    if (!hasOpaqueProofSession(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    const liveVerified = readinessState === 'enabled-live-verified';
    json(res, 200, {
      contract: CONTRACT,
      stages: ['chat', 'workflows', 'code', 'projects', 'skills'],
      readiness: {
        state: readinessState,
        configured: readinessState !== 'not-configured',
        enabled: readinessState.startsWith('enabled-'),
        liveProbeRequired: !liveVerified,
        liveVerified,
        proof: {
          state: proofState,
          receiptId: liveVerified ? `fcr-conveyor-receipt-v3:${'c'.repeat(64)}` : null,
          expectedHeadSha: proofHead,
          observedAt: proofHead ? '2026-08-21T21:30:00.000Z' : null,
        },
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await context.addCookies([{
  name: SESSION_COOKIE,
  value: SESSION_VALUE,
  url: baseUrl,
  httpOnly: true,
  sameSite: 'Strict',
}]);
const page = await context.newPage();

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

async function refreshDock() {
  const dock = page.locator('.launch-dock > summary');
  await dock.click();
  await dock.click();
}

try {
  await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'domcontentloaded' });

  // The readiness badge intentionally lives inside the closed founder-stack dock.
  // Open the real dock first, which also triggers a fresh authenticated readiness read.
  await page.locator('.launch-dock > summary').click();
  await expectReadiness('ready-for-probe', 'n8n configured · live probe required');
  assert.equal(lastAuthorization, null, 'opaque browser session must not emit a bearer Authorization header');
  assert.match(lastCookie ?? '', new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=${SESSION_VALUE}(?:;|$)`));
  const legacySession = await page.evaluate(() => sessionStorage.getItem('fcr_session'));
  assert(legacySession, 'opaque bootstrap should expose only a non-secret founder identity marker');
  const parsedLegacySession = JSON.parse(legacySession);
  assert.equal(parsedLegacySession.email, 'founder@example.com');
  assert.equal(parsedLegacySession.transport, 'opaque-http-only-cookie');
  assert.equal(Object.prototype.hasOwnProperty.call(parsedLegacySession, 'access_token'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsedLegacySession, 'refresh_token'), false);
  await page.locator('[data-conveyor-readiness]').scrollIntoViewIfNeeded();

  const genesisLink = page.locator('[data-genesis-evidence]');
  await genesisLink.waitFor({ state: 'visible' });
  assert.equal(await genesisLink.getAttribute('href'), '/control-room/genesis.html');
  assert.match(await genesisLink.innerText(), /Genesis evidence.*view origin record/i);
  assert.equal(await genesisLink.getAttribute('data-state'), null, 'Genesis evidence link must not carry readiness state');
  assert.equal(await genesisLink.getAttribute('class'), 'genesis-evidence-link', 'Genesis evidence link must not reuse readiness styling');

  const initialText = await page.locator('[data-conveyor-readiness]').innerText();
  assert.doesNotMatch(initialText, /verified/i);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    dockWidth: document.querySelector('.launch-dock')?.getBoundingClientRect().width ?? 0,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, 'readiness UI must not overflow the mobile viewport');
  assert(dimensions.dockWidth <= dimensions.viewportWidth, 'founder stack dock must fit mobile viewport');

  readinessState = 'enabled-awaiting-proof';
  proofState = 'not-observed';
  proofHead = EXACT_SHA;
  await refreshDock();
  await expectReadiness('enabled-awaiting-proof', 'n8n enabled · live proof missing');

  proofState = 'stale-head';
  proofHead = STALE_SHA;
  await refreshDock();
  await expectReadiness('enabled-awaiting-proof', 'n8n enabled · prior proof stale');

  proofState = 'readback-unavailable';
  proofHead = EXACT_SHA;
  await refreshDock();
  await expectReadiness('enabled-awaiting-proof', 'n8n enabled · proof readback unavailable');

  readinessState = 'enabled-live-verified';
  proofState = 'verified';
  proofHead = EXACT_SHA;
  await refreshDock();
  await expectReadiness('enabled-live-verified', 'n8n live · exact-head receipt verified');
  assert.match(await page.locator('[data-conveyor-readiness]').innerText(), /verified/i);

  await page.screenshot({
    path: resolve(outputDir, 'conveyor-readiness-live-verified-mobile.png'),
    fullPage: true,
  });

  readinessState = 'not-configured';
  proofState = 'not-observed';
  proofHead = null;
  await refreshDock();
  await expectReadiness('not-configured', 'n8n not configured');

  const finalText = await page.locator('[data-conveyor-readiness]').innerText();
  assert.doesNotMatch(finalText, /verified/i);

  await genesisLink.click();
  await page.waitForURL('**/control-room/genesis.html');
  await page.locator('[data-testid="genesis-demo"]').waitFor({ state: 'visible' });
  assert.match(await page.locator('[data-testid="authority-boundary"]').innerText(), /demo provenance only/i);

  console.log(JSON.stringify({
    ok: true,
    route: '/control-room/',
    viewport: '390x844',
    contract: CONTRACT,
    provedStates: [
      'ready-for-probe',
      'enabled-awaiting-proof:not-observed',
      'enabled-awaiting-proof:stale-head',
      'enabled-awaiting-proof:readback-unavailable',
      'enabled-live-verified',
      'not-configured',
    ],
    browserAuthority: 'opaque-http-only-cookie',
    bearerAuthorizationObserved: false,
    genesisRoute: '/control-room/genesis.html',
    screenshot: 'test-results/conveyor-readiness-live-verified-mobile.png',
    overflow: dimensions,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolvePromise, rejectPromise) => server.close((error) => error ? rejectPromise(error) : resolvePromise()));
}
