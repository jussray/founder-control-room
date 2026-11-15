/**
 * Playwright smoke proof for the real founder-only continuation route.
 * Scope: anonymous GET/POST must fail closed before any database calls.
 * This does not verify authenticated persistence, the native ChatGPT mode
 * switch, remote deployment, or a production founder account.
 *
 * Run: npm run verify:operator-continuation-auth
 */
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from '@playwright/test';

// Force a local, deliberately unreachable Supabase URL. The proof never uses
// real founder tokens, session cookies, production credentials or network data.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_ALLOW_LOCAL = 'true';
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-local-test-service-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-local-test-publishable-key';

const { operatorContinuationRouter } = await import('../src/http/routes/operatorContinuation.ts');

const app = express();
app.use(express.json());
app.use('/operator/continuity', operatorContinuationRouter);
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

  const post = await page.evaluate(async () => {
    const response = await fetch('/operator/continuity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ continuation: {} }),
    });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(post.status, 401, 'anonymous POST must return 401');
  assert.equal(post.body.error, 'Founder session required');

  console.log(JSON.stringify({
    contract: 'fcr/operator-continuation-anonymous-playwright-proof@v1',
    browser: 'chromium',
    realExpressRoute: true,
    anonymousGet: 401,
    anonymousPost: 401,
    authenticatedPersistenceVerified: false,
    liveDeploymentVerified: false,
    nativeModeSwitchVerified: false,
    status: 'PASS',
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
