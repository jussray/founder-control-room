import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 8821;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TENANT_EMAIL = 'tenant-founder@example.com';
const TENANT_WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN_WORKSPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const E2E_SESSION_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const BRIDGE_FILE = new URL('./.workspace-tenant-auth-bridge.json', import.meta.url).pathname;
const REPO_ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));

if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  ok — ${message}`);
  else {
    failures += 1;
    console.error(`  FAIL — ${message}`);
  }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Server at ${url} did not become healthy in time`);
}

async function waitForBridge() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(BRIDGE_FILE)) return JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
    await sleep(50);
  }
  throw new Error('Tenant magic-link auth bridge did not appear');
}

const foreignProject = {
  workspace_id: FOREIGN_WORKSPACE_ID,
  slug: 'foreign-project',
  name: 'Foreign Founder Project',
  repo_provider: 'github',
  repo_identifier: 'other-founder/private-project',
  stack: 'private',
  status: 'active',
  risk_level: 'medium',
};

const server = spawn(
  process.execPath,
  [
    '--import',
    new URL('./register-loader.mjs', import.meta.url).pathname,
    new URL('../dist/index.js', import.meta.url).pathname,
  ],
  {
    env: {
      ...process.env,
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
      SUPABASE_PUBLISHABLE_KEY: 'fake-publishable-key',
      FOUNDER_EMAIL: TENANT_EMAIL,
      E2E_SEED_FOUNDER_EMAIL: TENANT_EMAIL,
      E2E_SEED_FOUNDER_ROLE: 'workspace_owner',
      E2E_SEED_WORKSPACE_ID: TENANT_WORKSPACE_ID,
      E2E_SEED_PROJECTS_JSON: JSON.stringify([foreignProject]),
      E2E_AUTH_BRIDGE_FILE: BRIDGE_FILE,
      FOUNDER_SESSION_ENCRYPTION_KEY: E2E_SESSION_ENCRYPTION_KEY,
      PORT: String(PORT),
      NODE_ENV: 'development',
      FOUNDER_API_URL: BASE_URL,
      FOUNDER_ALLOWED_ORIGINS: BASE_URL,
      GITHUB_TOKEN: 'fake-github-token',
      GITHUB_API_BASE_URL: 'http://127.0.0.1:9',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

let browser;
try {
  await waitForServer(`${BASE_URL}/health`);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const jsErrors = [];
  page.on('pageerror', (error) => jsErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      jsErrors.push(message.text());
    }
  });

  console.log('\n[tenant-1] real workspace-owner login reaches canonical Composer');
  await page.goto(`${BASE_URL}/founder-onboarding/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#signed-out:not([hidden])');
  await page.fill('#email', TENANT_EMAIL);
  await page.click('#login-button');
  const bridge = await waitForBridge();
  assert(Boolean(bridge?.tokenHash), 'server generated the tenant founder magic-link token hash');

  await page.goto(`${BASE_URL}/auth/callback?token_hash=${bridge.tokenHash}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#signed-in:not([hidden])');
  assert((await page.locator('#founder-email').innerText()) === TENANT_EMAIL, 'tenant session lands on the real onboarding surface');

  const me = await page.evaluate(async () => {
    const response = await fetch('/workspace/me', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(me.status === 200, 'workspace identity endpoint accepts tenant founder');
  assert(me.body?.founder?.role === 'workspace_owner', 'identity is explicitly workspace_owner');
  assert(me.body?.founder?.workspaceId === TENANT_WORKSPACE_ID, 'identity is bound to the expected workspace');

  console.log('\n[tenant-2] foreign data and global authority stay inaccessible');
  const scoped = await page.evaluate(async () => {
    const response = await fetch('/workspace/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(scoped.status === 200, 'workspace project API is available');
  assert(scoped.body?.workspaceId === TENANT_WORKSPACE_ID, 'workspace API reports the authenticated workspace');
  assert(Array.isArray(scoped.body?.projects) && scoped.body.projects.length === 0, 'foreign-workspace project is invisible');

  const legacy = await page.evaluate(async () => {
    const response = await fetch('/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(legacy.status === 403, 'tenant is denied by legacy global project API');
  assert(String(legacy.body?.error ?? '').includes('platform founder authority'), 'denial names missing platform authority without leaking data');
  assert(await page.locator('.provider-grid').isHidden(), 'provider-slot controls are hidden for tenant founders');
  assert(await page.locator('.module-grid').isHidden(), 'global capability links are hidden for tenant founders');
  assert(await page.locator('#account-secondary').isHidden(), 'platform-only password mutation is hidden');

  console.log('\n[tenant-3] Chief binds recommendation to exact project before explicit creation');
  await page.waitForSelector('#onboarding-flow:not([hidden])');
  await page.check('input[name="projectType"][value="product-app"]');
  await page.click('[data-next-step="2"]');
  await page.check('input[name="mission"][value="launch"]');
  await page.click('[data-next-step="3"]');
  await page.fill('#project-name', 'Tenant Demo');
  await page.fill('#repo-identifier', 'tenant-founder/demo');
  await page.fill('#project-stack', 'TypeScript + Supabase');
  await page.check('input[name="currentState"][value="building"]');
  await page.click('[data-next-step="4"]');

  await page.waitForFunction(() => {
    const title = document.getElementById('chief-recommendation-title')?.textContent ?? '';
    return title.includes('Chief recommends');
  });
  const recTitle = await page.locator('#chief-recommendation-title').innerText();
  const recDetail = await page.locator('#chief-recommendation-detail').innerText();
  assert(recTitle.includes('launch'), 'server recommendation reflects the selected mission');
  assert(recDetail.includes('First gate:'), 'server recommendation exposes the first gate before creation');
  assert((await page.locator('#authority-confirm').locator('xpath=..').innerText()).includes('exact Chief recommendation'), 'founder-visible checkbox binds approval to the exact recommendation');

  mkdirSync(join(REPO_ROOT, 'logs'), { recursive: true });
  await page.screenshot({ path: join(REPO_ROOT, 'logs', 'workspace-chief-composer-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'tenant Composer has no document-level horizontal overflow on mobile');
  await page.screenshot({ path: join(REPO_ROOT, 'logs', 'workspace-chief-composer-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.check('#authority-confirm');
  await page.click('#workspace-button');
  await page.waitForSelector('#workspace-ready:not([hidden])');
  assert((await page.locator('#project-count').innerText()) === '1', 'tenant sees exactly one newly created project');
  assert((await page.locator('#connection-count').innerText()) === '0', 'project creation grants zero provider connections');
  assert(await page.locator('.module-grid').isHidden(), 'creation does not reveal global modules');
  assert(await page.locator('.ready-actions .primary-link').isHidden(), 'creation does not link tenant into legacy global cockpit');

  const afterCreate = await page.evaluate(async () => {
    const response = await fetch('/workspace/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(afterCreate.status === 200, 'tenant can reload its scoped project registry');
  assert(afterCreate.body?.workspaceId === TENANT_WORKSPACE_ID, 'created state remains bound to tenant workspace');
  assert(afterCreate.body?.projects?.length === 1, 'scoped registry contains only the tenant project');
  assert(afterCreate.body?.projects?.[0]?.slug === 'tenant-demo', 'project identity survives the round trip');
  assert(afterCreate.body?.projects?.[0]?.controlRoomProfile?.mission === 'launch', 'founder-declared Composer profile survives reload');

  console.log('\n[tenant-4] reload stays tenant-scoped and bypasses first-run');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#workspace-ready:not([hidden])');
  assert(await page.locator('#onboarding-flow').isHidden(), 'existing workspace project bypasses first-run Composer');
  assert((await page.locator('#project-count').innerText()) === '1', 'reload preserves scoped project count');
  assert(await page.locator('.module-grid').isHidden(), 'reload does not widen capability visibility');
  assert(jsErrors.length === 0, `no uncaught tenant-browser JavaScript errors (saw ${JSON.stringify(jsErrors)})`);

  await page.screenshot({ path: join(REPO_ROOT, 'logs', 'workspace-tenant-ready-desktop.png'), fullPage: true });
  await page.close();
} catch (error) {
  failures += 1;
  console.error(error);
  console.error('\n--- server log ---\n' + serverLog.slice(-12_000));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
  if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);
}

if (failures > 0) {
  throw new Error(`Workspace tenant Playwright proof failed with ${failures} assertion(s)`);
}

console.log('\nWorkspace tenant + Chief Composer Playwright proof passed.');
