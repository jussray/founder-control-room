import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { enforceSameOriginRoute, enforceSameOriginWebSocket } from '../scripts/fcr-browser-journey.mjs';

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

test('Playwright WebSocket guard keeps foreign endpoints unreachable while allowing approved origin', { timeout: 30000 }, async () => {
  let foreignConnections = 0;
  let approvedConnections = 0;
  const activeSockets = new Set();
  const foreign = createServer((_request, response) => { response.writeHead(404); response.end(); });
  foreign.on('upgrade', (_request, socket) => {
    foreignConnections += 1;
    socket.destroy();
  });
  await listen(foreign);
  const approved = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Approved synthetic WebSocket fixture</title>');
  });
  approved.on('upgrade', (request, socket) => {
    approvedConnections += 1;
    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') { socket.destroy(); return; }
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: ' + accept,
      '',
      '',
    ].join('\r\n'));
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));
  });

  let browser;
  let context;
  try {
    await listen(approved);
    const origin = `http://127.0.0.1:${approved.address().port}`;
    const external = `ws://127.0.0.1:${foreign.address().port}/outside`;
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', (socketRoute) => enforceSameOriginWebSocket(socketRoute, origin));
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async ({ approvedUrl, externalUrl }) => {
      const observe = (url) => new Promise((resolve) => {
        const socket = new WebSocket(url);
        let done = false;
        const complete = (event) => {
          if (done) return;
          done = true;
          try { socket.close(); } catch {}
          resolve(event);
        };
        socket.addEventListener('open', () => complete('opened'), { once: true });
        socket.addEventListener('error', () => complete('failed'), { once: true });
        setTimeout(() => complete('timed-out'), 4000);
      });
      return {
        allowed: await observe(approvedUrl),
        foreign: await observe(externalUrl),
      };
    }, {
      approvedUrl: `ws://127.0.0.1:${approved.address().port}/approved`,
      externalUrl: external,
    });

    assert.equal(result.allowed, 'opened', 'same-origin WebSocket must remain functional');
    assert.equal(approvedConnections, 1, 'the approved origin must receive one connection');
    assert.equal(foreignConnections, 0, 'the cross-origin server must receive no connection');
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    for (const socket of activeSockets) socket.destroy();
    if (approved.listening) await close(approved);
    if (foreign.listening) await close(foreign);
  }
});
