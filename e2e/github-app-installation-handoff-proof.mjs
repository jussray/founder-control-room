import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const payload = {
  summary: { installedConnections: 0, activeConnections: 0, errorConnections: 0,
    highRiskConnections: 0, activeTemporaryGrants: 0, missingAuthorityLevel: 0 },
  contract: { label: 'Plugin Center', purpose: 'Inspect scoped connections',
    enforcementNote: 'No implicit authority', principles: [] },
  catalog: [], connections: [], temporaryGrants: [],
};
const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/plugin-center') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
    return;
  }
  if (url.pathname === '/plugin-center/github-installation') {
    const id = url.searchParams.get('installation_id');
    const status = id === '42' ? 200 : id === '43' ? 409 : id === '44' ? 401 : 400;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status === 200 ? {
      verified: true,
      authorizesMcpAccess: false,
      authorizesMerge: false,
      installation: { repository: 'jussray/founder-control-room', installationId: '42' },
    } : { error: status === 409 ? 'GitHub installation identity does not match FCR'
      : status === 401 ? 'Founder session required' : 'Invalid installation identifier' }));
    return;
  }
  const requested = url.pathname.replace(/^\/+/, '');
  const filename = normalize(join(root, requested));
  if (!filename.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const type = filename.endsWith('.html') ? 'text/html'
      : filename.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(readFileSync(filename));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const scenarios = [
  { id: '42', expected: 'GitHub verified for jussray/founder-control-room' },
  { id: '43', expected: 'GitHub installation identity does not match FCR' },
  { id: '44', expected: 'Founder session required' },
  { id: '<script>', expected: 'Invalid installation identifier' },
];
try {
  for (const [index, scenario] of scenarios.entries()) {
    const context = await browser.newContext({ viewport: index === 0
      ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/control-room/plugin-center.html?installation_id='
      + encodeURIComponent(scenario.id), { waitUntil: 'networkidle' });
    await page.waitForFunction(expected => document.querySelector('#github-app-status')?.textContent?.includes(expected), scenario.expected);
    const text = await page.locator('#github-app-setup').innerText();
    const endpoint = await page.locator('#github-app-setup code.mono').innerText();
    const expectedEndpoint = new URL('https://api.foundercontrolroom.org/mcp');
    const actualEndpoint = new URL(endpoint);
    if (actualEndpoint.origin !== expectedEndpoint.origin ||
        actualEndpoint.pathname !== expectedEndpoint.pathname ||
        actualEndpoint.search || actualEndpoint.hash) {
      throw new Error('GitHub setup UI points to an unexpected MCP endpoint');
    }
    if (text.includes('MCP connected') || text.includes('Merge approved')) {
      throw new Error('Installation setup claimed unauthorized capabilities');
    }
    if (errors.length) throw new Error('GitHub setup browser error: ' + errors.join(' | '));
    if (index === 0) {
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) throw new Error('GitHub setup mobile horizontal overflow: ' + overflow);
      mkdirSync('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/github-app-installation-handoff-mobile.png', fullPage: true });
    }
    await context.close();
  }
  console.log('PASS: Playwright founder handoff UI renders verified, mismatched, unauthenticated, invalid and mobile states without implicit MCP authority.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
