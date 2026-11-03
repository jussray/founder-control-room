import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const publicDir = resolve(process.cwd(), 'public');
const outputDir = resolve('test-results/fcr-member-entry');
const staticPaths = new Map([
  ['/', 'index.html'],
  ['/fcr-public-tabs.js', 'fcr-public-tabs.js'],
  ['/welcome', 'welcome.html'],
  ['/assets/welcome-door.js', 'assets/welcome-door.js'],
  ['/member/', 'member/index.html'],
  ['/member/member.js', 'member/member.js'],
  ['/member/styles.css', 'member/styles.css'],
]);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const founderPaths = [];
let lastMemberEmail = '';
let failLogout = false;
let memberPresent = false;
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (/^\/(?:projects|dashboard|agents|missions|l99|promptos)(?:\/|$)/.test(url.pathname)) {
    founderPaths.push(url.pathname);
    return json(res, 403, { error: 'Founder-only' });
  }
  if (url.pathname === '/auth/me') return json(res, 401, { error: 'No founder session' });
  if (url.pathname === '/auth/member/me') {
    const hasCookie = /(?:^|;\s*)member_fixture=1(?:;|$)/.test(req.headers.cookie ?? '');
    return json(res, hasCookie ? 200 : 401, hasCookie
      ? { success: true, data: { member: { userId: '22222222-2222-4222-8222-222222222222', email: 'member@example.com' }, workspace: { projects: [], agents: [], activity: [] } } }
      : { success: false, error: { code: 'UNAUTHENTICATED' } });
  }
  if (url.pathname === '/auth/member/magic-link' && req.method === 'POST') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    lastMemberEmail = JSON.parse(raw).email;
    return json(res, 202, { success: true, data: { message: 'If this address can receive mail...' } });
  }
  if (url.pathname === '/auth/member/logout' && req.method === 'POST') {
    if (failLogout) return json(res, 503, { success: false, error: 'revocation failed' });
    res.writeHead(204, { 'Cache-Control': 'no-store', 'Set-Cookie': 'member_fixture=; Path=/; Max-Age=0' }); res.end(); return;
  }
  const file = staticPaths.get(url.pathname);
  if (!file) { res.writeHead(404); res.end('not found'); return; }
  const data = await readFile(resolve(publicDir, file));
  res.writeHead(200, { 'Content-Type': contentTypes[extname(file)], 'Cache-Control': 'no-store' });
  res.end(data);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
await mkdir(outputDir, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const publicPage = await browser.newPage({ viewport });
    await publicPage.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await publicPage.getByRole('tab', { name: 'Founder View' }).click();
    await publicPage.locator('#view-founder:not([hidden])').waitFor();
    const publicProjects = publicPage.locator('#view-founder #projects');
    await publicProjects.getByText(/Private projects are not listed/).waitFor();
    if (await publicProjects.locator('.row').count()) throw Error('Public founder preview leaks named projects');
    await publicPage.screenshot({ path: outputDir + '/' + label + '-public-founder-preview.png', fullPage: true });
    await publicPage.close();
    const signedOut = await browser.newPage({ viewport });
    await signedOut.goto(origin + '/member/', { waitUntil: 'domcontentloaded' });
    await signedOut.waitForURL('**/welcome');
    await signedOut.getByRole('heading', { name: /Welcome to FCR/ }).waitFor();
    await signedOut.getByRole('heading', { name: 'Your personal workspace' }).waitFor();
    await signedOut.locator('#member-email').fill('member@example.com');
    await signedOut.getByRole('button', { name: 'Continue to my workspace' }).click();
    await signedOut.getByRole('button', { name: 'Check your inbox' }).waitFor();
    if (lastMemberEmail !== 'member@example.com') throw Error('Incorrect member sign-in email');
    if (await signedOut.locator('.shell').count()) throw Error('Founder shell leaked into welcome');
    await signedOut.screenshot({ path: outputDir + '/' + label + '-welcome.png', fullPage: true });
    await signedOut.close();

    const context = await browser.newContext({ viewport });
    await context.addCookies([{ name: 'member_fixture', value: '1', url: origin }]);
    const member = await context.newPage();
    await member.goto(origin + '/member/', { waitUntil: 'domcontentloaded' });
    await member.getByRole('heading', { name: 'Your workspace is empty' }).waitFor();
    if (await member.locator('#workspace[hidden]').count()) throw Error('Authenticated member stayed hidden');
    if (await member.locator('.founder-email,.launch-dock').count()) throw Error('Founder controls leaked into member workspace');
    if (await member.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
      throw Error('Member workspace horizontal overflow: ' + label);
    }
    await member.screenshot({ path: outputDir + '/' + label + '-empty.png', fullPage: true });
    failLogout = true;
    await member.getByRole('button', { name: 'Log out' }).click();
    await member.getByText(/Logout did not complete/).waitFor();
    if (!member.url().endsWith('/member/')) throw Error('Failed logout falsely navigated away');
    failLogout = false;
    await member.getByRole('button', { name: 'Log out' }).click();
    await member.waitForURL('**/welcome');
    await context.close();
  }
  if (founderPaths.length) throw Error('Member screen requested private APIs: ' + founderPaths.join(', '));
  console.log('FCR member welcome, blank state and logout Playwright proof passed.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
