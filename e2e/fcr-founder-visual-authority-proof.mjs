import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = join(repoRoot, 'public');
const proofDir = join(repoRoot, 'test-results', 'fcr-founder-visual-authority');
mkdirSync(proofDir, { recursive: true });

function sendJson(res, body) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/auth/me') return sendJson(res, { success: true, data: { founder: { email: 'ray@example.test' } } });
  if (url.pathname === '/projects') return sendJson(res, { projects: [{ slug: 'founder-control-room', name: 'Founder Control Room', status: 'active', repo_provider: 'github', risk_level: 'low' }] });
  if (url.pathname === '/missions') return sendJson(res, { missions: [{ id: 'm1', title: 'Restore FCR visual authority', status: 'in_review', risk_level: 'medium', project: { slug: 'founder-control-room' } }] });
  if (url.pathname === '/activity') return sendJson(res, { activity: [{ event_type: 'visual_authority_checked', severity: 'info', created_at: new Date().toISOString(), project: { slug: 'founder-control-room' } }] });
  if (url.pathname === '/l99/status') return sendJson(res, { oodaFiringOrder: [{ status: 'pass' }], standaloneLaunchReady: false });
  if (url.pathname === '/promptos') return sendJson(res, { templates: [] });
  if (url.pathname === '/dashboard/costs') return sendJson(res, { totalUsd: 0, byAgent: [] });
  if (url.pathname === '/agents') return sendJson(res, { agents: [] });
  if (url.pathname === '/authority-levels') return sendJson(res, { levels: [] });
  if (url.pathname === '/automation/conveyor/') return sendJson(res, { contract: 'founder-control-room/n8n-conveyor@v3', readiness: { state: 'not-configured' } });
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/dashboard/')) return sendJson(res, {});
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }

  let path = url.pathname;
  if (path === '/') path = '/index.html';
  if (path.endsWith('/')) path += 'index.html';
  const candidate = normalize(join(publicRoot, path));
  if (!candidate.startsWith(publicRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': mime[extname(candidate)] ?? 'application/octet-stream' });
  res.end(readFileSync(candidate));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  assert.ok(dimensions.scroll <= dimensions.client, `${label}: horizontal overflow ${dimensions.scroll} > ${dimensions.client}`);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.getByText('SAME TRUTH.', { exact: true }).waitFor();
    await page.getByText('HIGHER OUTCOMES.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-fcr-public-canon="dashboard-v3"]').count(), 1);
    assert.ok(await page.getByText('AI Council', { exact: false }).count());
    assert.equal(await page.getByText('Temporarily unavailable').count(), 0);
    await noOverflow(page, `public ${name}`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(proofDir, `public-${name}.png`), fullPage: true });
    await page.close();
  }

  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/control-room/`, { waitUntil: 'networkidle' });
    await page.locator('[data-home]').waitFor({ timeout: 15000 });
    await page.getByText('SAME TRUTH.', { exact: false }).waitFor();
    await page.getByText('HIGHER OUTCOMES.', { exact: false }).waitFor();
    assert.equal(await page.getByText('ULTRATHINK', { exact: true }).count(), 0, 'ULTRATHINK must remain non-user-facing');
    assert.equal(await page.locator('[data-council-roster]').count(), 1);
    assert.equal(await page.locator('.fcr-nav-search').count(), 1);
    await noOverflow(page, `founder ${name}`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(proofDir, `founder-${name}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log('FCR founder visual authority proof passed: public front door + founder home match dashboard-v3, ULTRATHINK stays behind the UI, desktop/mobile screenshots captured, and no horizontal overflow.');
