// Exact checked-out FCR Council entrypoint proof.
// This verifies browser wiring against stubbed founder API responses only,
// not live provider execution, production authentication, or a public deployment.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));
const publicDir = resolve(root, 'public');
const outDir = resolve(root, 'test-results');
mkdirSync(outDir, { recursive: true });
const csp = readFileSync(resolve(publicDir, '_headers'), 'utf8')
  .split('\n').map((line) => line.trim())
  .find((line) => line.startsWith('Content-Security-Policy:'))
  ?.slice('Content-Security-Policy:'.length).trim();
if (!csp) throw new Error('Missing deployed Content-Security-Policy declaration');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const calls = [];
const project = { slug: 'storyengine', name: 'StoryEngine', repo_identifier: 'jussray/StoryEngine' };
const mission = { id: 'mission-1', title: 'Repair Save Beat', status: 'proposed', project: { slug: 'storyengine' } };
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp });
  res.end(JSON.stringify(body));
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/projects') return sendJson(res, 200, { projects: [project] });
  if (url.pathname === '/dashboard/tasks') return sendJson(res, 200, { tasks: [mission] });
  if (url.pathname === '/missions/mission-1/council/run') {
    calls.push({ path: url.pathname, method: req.method });
    return sendJson(res, 201, { conversation: { round: 1, id: 'receipt-1', outcome: 'Advisory review completed; code not changed.' }, relay: { status: 'completed' } });
  }
  if (url.pathname.startsWith('/missions/') || (req.method !== 'GET' && req.method !== 'HEAD')) {
    calls.push({ path: url.pathname, method: req.method });
    return sendJson(res, 409, { error: 'Unexpected mutation path' });
  }
  let path = normalize(join(publicDir, decodeURIComponent(url.pathname)));
  if (!path.startsWith(publicDir)) return sendJson(res, 403, { error: 'forbidden' });
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) return sendJson(res, 404, { error: 'not found' });
  res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Content-Security-Policy': csp });
  createReadStream(path).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1280, height: 850 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => sessionStorage.setItem('fcr_session', JSON.stringify({ access_token: 'browser-fixture' })));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(base + '/control-room/council.html');
    await page.locator('#council-status').filter({ hasText: 'Registry and missions read' }).waitFor();
    await page.locator('#council-name').fill('StoryEngine');
    await page.locator('#council-prompt').fill('Help me improve the existing Save Beat experience');
    await page.locator('#council-send').click();
    await page.getByText('POTENTIAL PROJECT MATCH:', { exact: false }).waitFor();
    if (calls.length) throw new Error('A name collision invoked a provider or mutation');
    await page.locator('#council-name').fill('Distinct Project');
    await page.locator('#council-send').click();
    await page.getByText('Idea intake, not an AI-generated diagnosis', { exact: false }).waitFor();
    if (calls.length) throw new Error('Prebuild intake invoked a provider or mutation');
    await page.locator('#council-project').selectOption('storyengine');
    await page.locator('#council-mission').selectOption('mission-1');
    await page.locator('#council-send').click();
    await page.locator('#council-status').filter({ hasText: 'Approve the exact advisory' }).waitFor();
    if (calls.length) throw new Error('A live Council round ran without explicit consent');
    await page.locator('#council-consent').check();
    await page.locator('#council-send').click();
    await page.getByText('receipt-1', { exact: false }).waitFor();
    if (calls.length !== (viewport.width === 1280 ? 1 : 2)) throw new Error('Expected one explicitly approved Council run per viewport');
    if (calls.some((c) => c.path !== '/missions/mission-1/council/run' || c.method !== 'POST')) throw new Error('Unauthorized endpoint invoked');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error('Horizontal overflow at width ' + viewport.width);
    if (errors.length) throw new Error('Browser errors: ' + errors.join(', '));
    await page.screenshot({ path: resolve(outDir, 'council-intake-' + viewport.width + '.png'), fullPage: true });
    await context.close();
  }
  console.log('Council intake browser proof passed: name collision, no-write preparation, explicit Council consent, desktop/mobile and CSP.');
} finally {
  if (browser) await browser.close();
  await new Promise((ok) => server.close(ok));
}
