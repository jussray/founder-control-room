import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import pagesWorker from '../public/_worker.js';
import { callbackHtml } from '../dist/http/routes/onboardingAssets/callbackHtml.js';
import { callbackJs } from '../dist/http/routes/onboardingAssets/callbackJs.js';
import { controlRoomCss } from '../dist/http/routes/onboardingAssets/controlRoomCss.js';

const apiPaths = [];
const assetPaths = [];
const sessionBodies = [];
const pageErrors = [];

function apiResponse(body, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set('x-founder-control-room-service', 'founder-control-room');
  return new Response(body, { ...init, headers });
}

const env = {
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      assetPaths.push(pathname);
      if (pathname === '/') {
        return new Response('<!doctype html><html><body><h1>Founder Control Room</h1><p id="proof-complete">Magic-link handoff complete.</p></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('Pages asset not found', { status: 404 });
    },
  },
  FCR_API: {
    async fetch(request) {
      const url = new URL(request.url);
      apiPaths.push(url.pathname);

      if (url.pathname === '/auth/callback') {
        return apiResponse(callbackHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      if (url.pathname === '/assets/auth-callback.js') {
        return apiResponse(callbackJs, {
          status: 200,
          headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      if (url.pathname === '/assets/control-room.css') {
        return apiResponse(controlRoomCss, {
          status: 200,
          headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      if (url.pathname === '/auth/session' && request.method === 'POST') {
        sessionBodies.push(await request.json());
        return apiResponse(JSON.stringify({
          success: true,
          data: { founder: { email: 'proof@example.com' } },
          meta: {},
        }), {
          status: 201,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
        });
      }

      return apiResponse('API route not found', { status: 404 });
    },
  },
};

let baseUrl = '';
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const request = new Request(new URL(req.url ?? '/', baseUrl), {
      method: req.method,
      headers: req.headers,
      ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
    });
    const response = await pagesWorker.fetch(request, env);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve proof server address.');
baseUrl = `http://127.0.0.1:${address.port}`;

mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/auth/callback#access_token=proof-access-token&refresh_token=proof-refresh-token`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForURL(`${baseUrl}/`, { timeout: 10_000 });
  await page.waitForSelector('#proof-complete', { timeout: 10_000 });

  const requiredApiPaths = [
    '/auth/callback',
    '/assets/control-room.css',
    '/assets/auth-callback.js',
    '/auth/session',
  ];
  for (const pathname of requiredApiPaths) {
    if (!apiPaths.includes(pathname)) {
      throw new Error(`MAGIC_LINK_EDGE_PROOF_MISSING_API_ROUTE: ${pathname}`);
    }
  }

  for (const pathname of ['/assets/control-room.css', '/assets/auth-callback.js']) {
    if (assetPaths.includes(pathname)) {
      throw new Error(`MAGIC_LINK_EDGE_PROOF_STATIC_SWALLOW: ${pathname}`);
    }
  }

  if (sessionBodies.length !== 1) {
    throw new Error(`MAGIC_LINK_EDGE_PROOF_SESSION_COUNT: expected 1, received ${sessionBodies.length}`);
  }
  const [sessionBody] = sessionBodies;
  if (sessionBody?.access_token !== 'proof-access-token' || sessionBody?.refresh_token !== 'proof-refresh-token') {
    throw new Error('MAGIC_LINK_EDGE_PROOF_FRAGMENT_HANDOFF: callback did not hand the expected session to /auth/session');
  }
  if (pageErrors.length > 0) {
    throw new Error(`MAGIC_LINK_EDGE_PROOF_BROWSER_ERROR: ${pageErrors.join(' | ')}`);
  }

  await page.screenshot({ path: 'test-results/pages-auth-callback-proof.png', fullPage: true });
  console.log(JSON.stringify({
    result: 'PASS',
    finalUrl: page.url(),
    apiPaths,
    assetPaths,
    sessionHandoffCount: sessionBodies.length,
    screenshot: 'test-results/pages-auth-callback-proof.png',
  }, null, 2));
} finally {
  await browser.close();
  server.close();
  await once(server, 'close');
}
