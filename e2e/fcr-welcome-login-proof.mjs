import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = join(process.cwd(), 'public');
const outputDir = 'test-results/fcr-welcome-login';
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
let lastMagicLinkBody = null;
let lastPreviewBody = null;
function sendJson(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
function signedIn(req) { return String(req.headers.cookie ?? '').includes('fcr_test_session=1'); }
async function jsonBody(req) { let raw = ''; for await (const chunk of req) raw += chunk; return raw ? JSON.parse(raw) : {}; }
const bootFixtures = new Map([
  ['/projects', { projects: [] }], ['/dashboard/tasks', { tasks: [] }], ['/dashboard/activity', { activity: [] }],
  ['/l99/status', { standaloneLaunchReady: false, redTeamVerdict: 'Preview only.', oodaFiringOrder: [] }],
  ['/promptos', { templates: [] }], ['/dashboard/costs', { totalUsd: 0, byAgent: [] }], ['/agents', { agents: [] }], ['/authority-levels', { levels: [] }],
]);
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/auth/me') return signedIn(req) ? sendJson(res, 200, { founder: { email: 'founder@example.com' } }) : sendJson(res, 401, { error: 'signed out' });
  if (url.pathname === '/automation/conveyor/') return sendJson(res, signedIn(req) ? 200 : 401, signedIn(req) ? { contract: 'founder-control-room/n8n-conveyor@v3', readiness: { state: 'not-configured' } } : { error: 'signed out' });
  if (url.pathname === '/auth/magic-link' && req.method === 'POST') { lastMagicLinkBody = await jsonBody(req); return sendJson(res, 202, { message: 'Check your email.' }); }
  if (url.pathname === '/founder-os/preview' && req.method === 'POST') {
    if (!signedIn(req)) return sendJson(res, 401, { error: 'signed out' });
    lastPreviewBody = await jsonBody(req);
    return sendJson(res, 200, { status: 'simulated', plan: { readiness: 'ready_for_review', route: { chiefSkill: 'juss-chief-ai', capabilityPlan: { observed: false, valid: false } }, authority: { level: 'L0', mode: 'simulation', executionAllowed: false } } });
  }
  if (req.method === 'GET' && bootFixtures.has(url.pathname)) { if (!signedIn(req)) return sendJson(res, 401, { error: 'signed out' }); return sendJson(res, 200, bootFixtures.get(url.pathname)); }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
  const clean = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(root, clean);
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  try { const body = await readFile(filePath); res.writeHead(200, { 'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
function assert(condition, message) { if (!condition) throw new Error(message); }
async function assertNoOverflow(page, label) { assert(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), `${label} overflows horizontally.`); }
await new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
async function proveSignedOut(viewport, suffix) {
  const page = await browser.newPage({ viewport }); const consoleErrors = []; page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: 'Move one thing forward.' }).waitFor();
  const enter = page.getByRole('link', { name: /Enter Control Room/ }); await enter.waitFor();
  assert(await enter.count() === 1, 'Welcome must expose exactly one primary Enter Control Room CTA.');
  assert(await page.locator('.bottom-nav').count() === 0, 'Welcome must not expose the old five-screen bottom navigation.');
  assert(await page.getByText('Meet Chief', { exact: true }).count() === 0, 'Welcome must not split the first decision into a Chief CTA.');
  assert(await page.getByText('PromptOS', { exact: true }).count() === 0, 'Welcome must not expose a PromptOS explainer surface.');
  await assertNoOverflow(page, `${suffix} welcome`); await page.screenshot({ path: `${outputDir}/${suffix}-welcome.png`, fullPage: true });
  await enter.click(); await page.waitForURL('**/control-room/'); await page.getByRole('heading', { name: 'Who are you?' }).waitFor();
  assert(await page.locator('.launch-dock').count() === 0, 'Signed-out doorway must not expose the founder execution-stack dock.');
  assert(await page.locator('.shell').count() === 0, 'Signed-out stranger must not see the authenticated shell.');
  const email = page.locator('input[type="email"]'); await email.waitFor({ state: 'visible' }); await page.getByRole('button', { name: 'Continue' }).waitFor(); await assertNoOverflow(page, `${suffix} login`);
  if (suffix === 'desktop') { await email.fill('founder@example.com'); await page.getByRole('button', { name: 'Continue' }).click(); await page.getByText(/check your inbox for a magic link/i).waitFor(); assert(lastMagicLinkBody?.email === 'founder@example.com', 'Login must send only the founder email to /auth/magic-link.'); }
  await page.screenshot({ path: `${outputDir}/${suffix}-login.png`, fullPage: true });
  const unexpected = consoleErrors.filter((line) => !line.includes('401')); assert(unexpected.length === 0, `Unexpected signed-out console errors: ${unexpected.join(' | ')}`); await page.close();
}
async function proveSignedIn(viewport, suffix) {
  const context = await browser.newContext({ viewport }); await context.addCookies([{ name: 'fcr_test_session', value: '1', url: 'http://127.0.0.1:4173/' }]); const page = await context.newPage(); const consoleErrors = []; page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173/control-room/', { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: 'What do you want to move?' }).waitFor();
  assert(await page.locator('.sign-in-wrap').count() === 0, 'Authenticated founder must not remain on the sign-in surface.'); assert(await page.locator('.launch-dock').count() === 0, 'Authenticated entry surface must not restore the removed launch dock.');
  await page.locator('#founder-intent').fill('Make the FCR login easier to understand.'); await page.getByRole('button', { name: 'Shape plan' }).click();
  await page.getByText('Here is the route before anything moves.').waitFor(); await page.getByText('Intent is ready for structured handoff').waitFor(); await page.getByText('Capability selection is the next handoff').waitFor(); await page.getByText('Authority locked for review').waitFor(); await page.getByText(/Nothing executed/i).waitFor();
  assert(lastPreviewBody?.goal === 'Make the FCR login easier to understand.', 'Intent preview must preserve the exact founder goal.'); assert(lastPreviewBody?.action === 'plan', 'Intent entry must request the review-only plan action.'); assert(lastPreviewBody?.command === 'v10', 'Intent entry must use the checked-in V10 governance lens.'); assert(!('approval' in (lastPreviewBody ?? {})), 'Intent entry must not smuggle founder approval into preview.'); assert(!('capabilityPlan' in (lastPreviewBody ?? {})), 'Intent entry must not pretend Chief capability selection already occurred.');
  await assertNoOverflow(page, `${suffix} intent preview`); await page.screenshot({ path: `${outputDir}/${suffix}-intent.png`, fullPage: true }); assert(consoleErrors.length === 0, `Unexpected signed-in console errors: ${consoleErrors.join(' | ')}`); await context.close();
}
try { await proveSignedOut({ width: 1440, height: 900 }, 'desktop'); await proveSignedOut({ width: 390, height: 844 }, 'mobile'); await proveSignedIn({ width: 1440, height: 900 }, 'desktop'); await proveSignedIn({ width: 390, height: 844 }, 'mobile'); console.log('FCR simple welcome/login/intent Playwright proof passed.'); }
finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
