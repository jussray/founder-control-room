import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT = join(REPO_ROOT, 'public');
const RESULTS_ROOT = join(REPO_ROOT, 'test-results', 'fcr-user-space-signal-loop');
const SIGNAL_LOOP_URL = 'https://24app.cc/apps/5ac26ftu/';
const STORAGE_KEY = 'fcr.user-space.v1';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const filePath = normalize(join(PUBLIC_ROOT, relative));
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('FCR user-space proof server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;
mkdirSync(RESULTS_ROOT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

async function proveFrontDoorSplit() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const user = page.locator('[data-entry-choice="user"]');
  const founder = page.locator('[data-entry-choice="founder"]');
  if (await user.getAttribute('href') !== '#discover') throw new Error('User view must route to the public onboarding screen before the blank workspace');
  if (await founder.getAttribute('href') !== '#founder-start') throw new Error('Founder view must retain the founder onboarding route');

  const publicCopy = await page.locator('body').innerText();
  for (const phrase of ['Move the company from signal to proof', 'Current Reality', 'Next Gate', 'Verified', 'Unknown', 'Blocked']) {
    if (!publicCopy.toLowerCase().includes(phrase.toLowerCase())) throw new Error(`FCR public identity missing: ${phrase}`);
  }
  const semanticLanes = await page.locator('[data-fcr-semantics] [data-fcr-semantic]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-fcr-semantic')));
  if (JSON.stringify(semanticLanes) !== JSON.stringify(['decide', 'evidence', 'act', 'outcome'])) {
    throw new Error(`FCR semantic lanes drifted: ${JSON.stringify(semanticLanes)}`);
  }

  await user.click();
  if (!page.url().endsWith('#discover')) throw new Error('User view click must land on the public onboarding screen');

  const blankWorkspace = page.locator('[data-user-start="workspace"]');
  if (await blankWorkspace.count() !== 1) throw new Error('Public onboarding must expose exactly one blank user-workspace lane');
  if (await blankWorkspace.getAttribute('href') !== '/user-space.html') throw new Error('Blank user-workspace lane must route to /user-space.html');

  const signalLoop = page.locator('[data-fcr-signal-loop]');
  if (await signalLoop.count() !== 1) throw new Error('FCR must expose exactly one SignalLoop attachment');
  if (await signalLoop.getAttribute('href') !== SIGNAL_LOOP_URL) throw new Error('FCR SignalLoop attachment must retain the exact surviving blue-builder URL');

  await page.screenshot({ path: join(RESULTS_ROOT, 'front-door-split.png'), fullPage: true });
  await context.close();
}

async function proveBlankUserSpace() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const networkRequests = [];
  page.on('request', (request) => networkRequests.push(request.url()));

  await page.goto(`${baseUrl}/user-space.html`, { waitUntil: 'networkidle' });
  await page.locator('[data-fcr-user-space]').waitFor({ state: 'visible' });
  if (await page.locator('[data-fcr-command-surface]').count() !== 1) throw new Error('User workspace must expose one FCR command surface');

  const initialStorage = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (initialStorage !== null) throw new Error('User workspace must start with no device-local record');
  if (!(await page.locator('[data-user-empty-state]').isVisible())) throw new Error('Blank user workspace must render the empty state');
  if (await page.locator('[data-user-saved-state]').isVisible()) throw new Error('Blank user workspace must not render saved state before user input');

  const body = await page.locator('body').innerText();
  for (const phrase of ['Current Reality', 'Next Gate', 'Decision', 'Evidence', 'Action', 'Outcome']) {
    if (!body.toLowerCase().includes(phrase.toLowerCase())) throw new Error(`User workspace lost FCR operating language: ${phrase}`);
  }
  const forbiddenFounderSpecific = [/Juss\b/i, /jussray/i, /Se.?kret Bip/i, /ULTRATHINK/i, /StoryEngine/i, /Juss Beautiful Hair/i];
  for (const pattern of forbiddenFounderSpecific) {
    if (pattern.test(body)) throw new Error(`User workspace leaked founder-specific content matching ${pattern}`);
  }

  const founderOnlyRequests = networkRequests.filter((url) => /\/control-room\/?|\/projects\b|\/missions\b|api\.foundercontrolroom\.org/i.test(url));
  if (founderOnlyRequests.length) throw new Error(`Blank user workspace made founder-only network requests: ${founderOnlyRequests.join(', ')}`);

  const signalLoop = page.locator('[data-user-signal-loop]');
  if (await signalLoop.getAttribute('href') !== SIGNAL_LOOP_URL) throw new Error('User workspace must expose the same exact SignalLoop attachment');

  await page.locator('input[name="goal"]').fill('Understand which message people respond to.');
  await page.locator('textarea[name="signal"]').fill('Three people asked the same question after reading the post.');
  await page.getByRole('button', { name: 'Save to this device' }).click();
  if (!(await page.locator('[data-user-saved-state]').isVisible())) throw new Error('User-owned input must render after local save');
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!stored || !stored.includes('Three people asked the same question')) throw new Error('User-owned state must persist only after explicit user input');
  const nextGateCopy = await page.locator('[data-next-gate]').innerText();
  if (!/Choose one focused move that can test this signal/i.test(nextGateCopy)) throw new Error(`Saved user reality did not produce the bounded FCR next gate: ${nextGateCopy}`);

  await page.getByRole('button', { name: 'Clear this device' }).click();
  const cleared = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (cleared !== null) throw new Error('Clear must remove the device-local user workspace record');
  if (!(await page.locator('[data-user-empty-state]').isVisible())) throw new Error('Clear must restore the blank state');

  await page.screenshot({ path: join(RESULTS_ROOT, 'user-space-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error('User workspace has horizontal overflow on mobile');
  await page.screenshot({ path: join(RESULTS_ROOT, 'user-space-mobile.png'), fullPage: true });
  await context.close();
}

async function proveSignalLoopReachability() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const response = await page.goto(SIGNAL_LOOP_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response || response.status() >= 400) throw new Error(`SignalLoop public surface is not reachable: ${response?.status() ?? 'no response'}`);
  const text = (await page.locator('body').innerText()).trim();
  if (!text) throw new Error('SignalLoop public surface returned an empty rendered body');
  await page.screenshot({ path: join(RESULTS_ROOT, 'signal-loop-public-surface.png'), fullPage: true });
  await context.close();
}

try {
  await proveFrontDoorSplit();
  await proveBlankUserSpace();
  await proveSignalLoopReachability();
  console.log('PASS: FCR preserves its User/Founder entry contract, signal-to-proof identity, semantic lanes, Current Reality/Next Gate hierarchy, blank local-first user space, and exact SignalLoop attachment on desktop/mobile.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
