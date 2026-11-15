/**
 * Playwright smoke proof for the real founder-only continuation route.
 * Scope: anonymous GET/POST must fail closed before any database calls.
 * This does not verify authenticated persistence, the native ChatGPT mode
 * switch, remote deployment, or a production founder account.
 *
 * Run: npm run verify:operator-continuation-auth
 */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Force a local, deliberately unreachable Supabase URL. The proof never uses
// real founder tokens, session cookies, production credentials or network data.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_ALLOW_LOCAL = 'true';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-local-test-service-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-local-test-publishable-key';
process.env.FOUNDER_API_URL = 'http://localhost:8787';
process.env.FOUNDER_ALLOWED_ORIGINS = 'http://localhost:8787';

const { createServer } = await import('../src/http/server.ts');

// Mount the real FCR server so Playwright exercises global CORS, CSRF,
// rate limiting, JSON parsing, and founder auth instead of a router-only stub.
const app = createServer();
const server = await new Promise((resolve) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  const view = await page.goto(
    baseUrl + '/operator/continuity/synthetic-task?projectSlug=founder-control-room&repositoryFullName=jussray%2Ffounder-control-room',
  );
  assert.equal(view?.status(), 401, 'anonymous GET must return 401');
  assert.equal(
    JSON.parse(await page.locator('body').innerText()).error,
    'Founder session required',
  );

  assert.equal(view?.headers()['cache-control'], 'private, no-store');
  const crossOrigin = await page.evaluate(async () => {
    const response = await fetch('/operator/continuity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ continuation: {} }),
    });
    return { status: response.status };
  });
  assert.equal(crossOrigin.status, 403, 'unexpected browser origin must be blocked');

  // Simulate the configured canonical browser origin using Playwright's
  // API request context. This verifies that the request passes CORS/CSRF
  // before being rejected at the independent founder-authentication gate.
  const sameOrigin = await page.request.post(baseUrl + '/operator/continuity', {
    headers: {
      Origin: process.env.FOUNDER_API_URL,
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json',
    },
    data: { continuation: {} },
  });
  assert.equal(sameOrigin.status(), 401, 'no founder session must always return 401');
  assert.equal((await sameOrigin.json()).error, 'Founder session required');
  assert.equal(sameOrigin.headers()['cache-control'], 'private, no-store');

  // The route-specific limit (60/minute) is stricter than the server's
  // general limiter (120/minute). Verify its own response contract.
  let rateLimitProof = null;
  for (let attempt = 0; attempt < 65; attempt += 1) {
    const response = await page.request.get(
      baseUrl + '/operator/continuity/synthetic-task?projectSlug=founder-control-room&repositoryFullName=jussray%2Ffounder-control-room',
    );
    if (response.status() === 429) {
      rateLimitProof = await response.json();
      break;
    }
    assert.equal(response.status(), 401, 'pre-limit requests must still require founder auth');
  }
  assert.deepEqual(rateLimitProof, { code: 'continuation_rate_limited' });

  console.log(JSON.stringify({
    contract: 'fcr/operator-continuation-anonymous-playwright-proof@v1',
    browser: 'chromium',
    fullFcrServer: true,
    anonymousGet: 401,
    unexpectedBrowserOriginPost: 403,
    allowedOriginWithoutFounderPost: 401,
    routeSpecificRateLimit: 429,
    authenticatedPersistenceVerified: false,
    liveDeploymentVerified: false,
    nativeModeSwitchVerified: false,
    status: 'PASS',
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
