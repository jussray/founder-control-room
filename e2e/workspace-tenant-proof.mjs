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
  if (condition) {
    console.log(`  ok — ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL — ${message}`);
  }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Server at ${url} did not become healthy in time`);
}

async function waitForBridge() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

  console.log('\n[tenant-1] Real workspace-owner sign-in through onboarding UI');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#signed-out:not([hidden])');
  await page.fill('#email', TENANT_EMAIL);
  await page.click('#login-button');
  const bridge = await waitForBridge();
  assert(Boolean(bridge?.tokenHash), 'server generated the tenant founder magic-link token hash');

  await page.goto(`${BASE_URL}/auth/callback?token_hash=${bridge.tokenHash}`);
  await page.waitForSelector('#signed-in:not([hidden])');
  assert((await page.locator('#founder-email').innerText()) === TENANT_EMAIL, 'tenant session lands on the real FCR onboarding surface');

  const me = await page.evaluate(async () => {
    const response = await fetch('/auth/me', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  const mePayload = me.body?.success === true ? me.body.data : me.body;
  assert(me.status === 200, 'tenant can read its authenticated identity');
  assert(mePayload?.founder?.role === 'workspace_owner', 'browser identity is explicitly workspace_owner');
  assert(mePayload?.founder?.workspaceId === TENANT_WORKSPACE_ID, 'browser identity is bound to the expected workspace');

  console.log('\n[tenant-2] Foreign workspace data is invisible and legacy global authority fails closed');
  const initialScoped = await page.evaluate(async () => {
    const response = await fetch('/workspace/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(initialScoped.status === 200, 'workspace project API is available to the tenant');
  assert(initialScoped.body?.workspaceId === TENANT_WORKSPACE_ID, 'workspace project API reports the bound tenant workspace');
  assert(Array.isArray(initialScoped.body?.projects) && initialScoped.body.projects.length === 0, 'foreign-workspace seeded project is not visible');

  const legacyGlobal = await page.evaluate(async () => {
    const response = await fetch('/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(legacyGlobal.status === 403, 'workspace owner is denied by the legacy global project API');
  assert(
    String(legacyGlobal.body?.error ?? '').includes('platform founder authority'),
    'legacy denial names the missing platform authority instead of leaking data',
  );

  assert(await page.locator('#workspace-boundary-note').isVisible(), 'tenant isolation boundary is founder-visible');
  assert(await page.locator('#provider-slots-fieldset').isHidden(), 'provider connection controls stay hidden from unproved tenant authority');
  assert(await page.locator('#platform-modules').isHidden(), 'legacy platform capability links stay hidden from tenant accounts');
  assert(await page.locator('#password-panel').isHidden(), 'platform-only password mutation is not offered to tenant accounts');

  console.log('\n[tenant-3] Create one project through the real tenant browser path');
  await page.waitForSelector('#onboarding-flow:not([hidden])');
  await page.fill('#project-name', 'Tenant Demo');
  await page.fill('#project-slug', 'tenant-demo');
  await page.fill('#repo-identifier', 'tenant-founder/demo');
  await page.fill('#project-stack', 'TypeScript + Supabase');
  await page.check('#authority-confirm');
  await page.click('#workspace-button');
  await page.waitForSelector('#workspace-ready:not([hidden])');

  assert((await page.locator('#project-count').innerText()) === '1', 'tenant UI reports exactly one visible project');
  assert((await page.locator('#connection-count').innerText()) === '0', 'tenant project creation grants zero provider connections');
  assert((await page.locator('#workspace-summary').innerText()).includes('isolated project'), 'tenant UI describes the project as isolated');
  assert((await page.locator('#workspace-summary').innerText()).includes('Chief execution remain locked'), 'tenant UI does not overclaim Chief execution authority');

  const afterCreate = await page.evaluate(async () => {
    const response = await fetch('/workspace/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(afterCreate.status === 200, 'tenant can reload its scoped project registry');
  assert(afterCreate.body?.projects?.length === 1, 'scoped registry contains only the newly created tenant project');
  assert(afterCreate.body?.projects?.[0]?.workspace_id === TENANT_WORKSPACE_ID, 'new project is persisted with the authenticated workspace id');
  assert(afterCreate.body?.projects?.[0]?.slug === 'tenant-demo', 'new project identity survives the round trip');

  mkdirSync(join(REPO_ROOT, 'test-results'), { recursive: true });
  await page.screenshot({
    path: join(REPO_ROOT, 'test-results', 'workspace-tenant-desktop.png'),
    fullPage: true,
  });

  console.log('\n[tenant-4] Mobile tenant boundary');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'tenant onboarding has no document-level horizontal overflow on mobile',
  );
  await page.screenshot({
    path: join(REPO_ROOT, 'test-results', 'workspace-tenant-mobile.png'),
    fullPage: true,
  });
  assert(jsErrors.length === 0, `no uncaught tenant-browser JavaScript errors (saw ${JSON.stringify(jsErrors)})`);

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

console.log('\nWorkspace tenant Playwright proof passed.');
