import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { enforceSameOriginRoute } from '../scripts/fcr-browser-journey.mjs';

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const close = (server) => new Promise((resolve) => server.close(resolve));

test('Playwright never follows a cross-origin redirect from an allowed origin', { timeout: 30000 }, async () => {
  let externalHits = 0;
  const external = createServer((_request, response) => {
    externalHits += 1;
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('should never arrive');
  });
  await listen(external);
  const externalOrigin = `http://127.0.0.1:${external.address().port}`;
  const local = createServer((request, response) => {
    if (request.url === '/escape') {
      response.writeHead(302, { Location: `${externalOrigin}/leak` });
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Safe synthetic page</title><p>safe</p>');
  });
  let browser;
  let context;
  try {
    await listen(local);
    const origin = `http://127.0.0.1:${local.address().port}`;
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', (route) => enforceSameOriginRoute(route, origin));
    const page = await context.newPage();

    const safe = await page.goto(`${origin}/safe`, { waitUntil: 'domcontentloaded' });
    assert.equal(safe.status(), 200, 'ordinary same-origin responses must work');

    await assert.rejects(
      page.goto(`${origin}/escape`, { waitUntil: 'domcontentloaded', timeout: 8000 }),
      'the redirected navigation must be blocked',
    );
    assert.equal(externalHits, 0, 'cross-origin server must receive no requests');
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (local.listening) await close(local);
    await close(external);
  }
});
