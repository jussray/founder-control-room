import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 8831;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CUSTOMER_EMAIL = 'new-founder@example.com';
const FOREIGN_WORKSPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const E2E_SESSION_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const BRIDGE_FILE = new URL('./.workspace-new-user-auth-bridge.json', import.meta.url).pathname;
const REPO_ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const CHIEF_EXPECTED_SHA = process.env.CHIEF_EXPECTED_SHA || '4534fc784e7dd4a84a0e4e766bd43279f9a8c159';
const CHIEF_AI_BASE_URL = process.env.CHIEF_AI_BASE_URL || 'https://a38745f4-chief-ai.mcgill-raylene.workers.dev';
const EXPECTED_HEAD_SHA = process.env.EXPECTED_HEAD_SHA || null;

if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);
mkdirSync(join(REPO_ROOT, 'logs'), { recursive: true });

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  ok — ${message}`);
  else {
    failures += 1;
    console.error(`  FAIL — ${message}`);
  }
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Server at ${url} did not become healthy in time`);
}

async function waitForBridge() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(BRIDGE_FILE)) return JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
    await sleep(50);
  }
  throw new Error('Customer founder magic-link bridge did not appear');
}

async function proveChiefRuntime() {
  const response = await fetch(`${CHIEF_AI_BASE_URL}/version`, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/json')) {
    throw new Error(`Chief exact runtime unavailable: status=${response.status} content-type=${contentType}`);
  }
  const identity = await response.json();
  if (identity?.sha !== CHIEF_EXPECTED_SHA) {
    throw new Error(`Chief runtime identity mismatch: expected ${CHIEF_EXPECTED_SHA}, got ${identity?.sha ?? 'null'}`);
  }
  console.log(`Chief exact runtime verified: ${identity.sha}`);
}

await proveChiefRuntime();

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
      FOUNDER_EMAIL: 'platform-owner@example.com',
      E2E_PUBLIC_WORKSPACE: '1',
      E2E_REAL_CHIEF: '1',
      E2E_SEED_PROJECTS_JSON: JSON.stringify([foreignProject]),
      E2E_AUTH_BRIDGE_FILE: BRIDGE_FILE,
      FOUNDER_SESSION_ENCRYPTION_KEY: E2E_SESSION_ENCRYPTION_KEY,
      PORT: String(PORT),
      NODE_ENV: 'development',
      FOUNDER_API_URL: BASE_URL,
      FOUNDER_ALLOWED_ORIGINS: BASE_URL,
      CHIEF_AI_BASE_URL,
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

  console.log('\n[customer-1] a new user enters the customer Founder surface');
  await page.goto(`${BASE_URL}/app/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#signed-out:not([hidden])');
  assert((await page.locator('body').innerText()).includes('isolated Founder Control Room workspace'), 'customer /app copy names isolated workspace authority');
  assert((await page.locator('#google-login').getAttribute('href')) === '/auth/workspace/google', 'customer Google login uses workspace auth path');

  await page.fill('#email', CUSTOMER_EMAIL);
  await page.click('#login-button');
  const bridge = await waitForBridge();
  assert(Boolean(bridge?.tokenHash), 'public customer magic-link request creates a one-time verified login token');

  console.log('\n[customer-2] verified identity provisions one isolated workspace_owner account');
  await page.goto(`${BASE_URL}/auth/workspace/callback?token_hash=${encodeURIComponent(bridge.tokenHash)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#signed-in:not([hidden])');

  const me = await page.evaluate(async () => {
    const response = await fetch('/workspace/me', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(me.status === 200, 'new customer identity is accepted by the workspace identity membrane');
  assert(me.body?.founder?.role === 'workspace_owner', 'new account receives workspace_owner and never platform_owner');
  assert(typeof me.body?.founder?.workspaceId === 'string' && me.body.founder.workspaceId.length > 0, 'new account receives an isolated workspace id');
  assert(me.body?.founder?.workspaceId !== FOREIGN_WORKSPACE_ID, 'new workspace is distinct from foreign tenant state');

  const legacy = await page.evaluate(async () => {
    const response = await fetch('/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(legacy.status === 403, 'customer founder cannot use private/global project authority');

  const before = await page.evaluate(async () => {
    const response = await fetch('/workspace/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(before.status === 200, 'isolated workspace project registry is readable');
  assert(Array.isArray(before.body?.projects) && before.body.projects.length === 0, 'foreign project is invisible before customer creation');

  console.log('\n[customer-3] real Chief recommends, but recommendation alone creates nothing');
  await page.waitForSelector('#onboarding-flow:not([hidden])');
  await page.locator('label.choice-card:has(input[name="projectType"][value="product-app"])').click();
  await page.click('[data-next-step="2"]');
  await page.locator('label.choice-card:has(input[name="mission"][value="launch"])').click();
  await page.click('[data-next-step="3"]');
  await page.fill('#project-name', 'Customer Launch Demo');
  await page.fill('#repo-identifier', 'customer-founder/launch-demo');
  await page.fill('#project-stack', 'TypeScript + Supabase');
  await page.locator('label.state-chip:has(input[name="currentState"][value="building"])').click();
  await page.click('[data-next-step="4"]');

  await page.waitForFunction(() => {
    const title = document.getElementById('chief-recommendation-title')?.textContent ?? '';
    return title.includes('Chief recommends');
  });
  const recommendationTitle = await page.locator('#chief-recommendation-title').innerText();
  assert(recommendationTitle.includes('Launch'), 'real Chief recommendation reflects the selected launch mission');

  const stillEmpty = await page.evaluate(async () => {
    const response = await fetch('/workspace/projects', { credentials: 'same-origin' });
    return await response.json();
  });
  assert(stillEmpty?.projects?.length === 0, 'Chief recommendation grants no creation authority by itself');
  assert((await page.locator('#authority-confirm').locator('xpath=..').innerText()).includes('exact Chief recommendation'), 'browser requires explicit founder approval of the exact recommendation');

  await page.screenshot({ path: join(REPO_ROOT, 'logs', 'workspace-new-user-before-approval.png'), fullPage: true });

  console.log('\n[customer-4] explicit approval creates exactly one scoped Control Room');
  await page.locator('label.confirm-row:has(#authority-confirm)').click();
  await page.click('#workspace-button');
  await page.waitForSelector('#workspace-ready:not([hidden])');

  const after = await page.evaluate(async () => {
    const response = await fetch('/workspace/projects', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(after.status === 200, 'created customer Control Room remains readable through workspace scope');
  assert(after.body?.workspaceId === me.body?.founder?.workspaceId, 'created project stays bound to the provisioned workspace');
  assert(after.body?.projects?.length === 1, 'explicit approval creates exactly one customer Control Room');
  assert(after.body?.projects?.[0]?.slug === 'customer-launch-demo', 'created Control Room has the approved project identity');
  assert(after.body?.projects?.[0]?.controlRoomProfile?.mission === 'launch', 'approved founder mission is preserved as declared state');
  assert((await page.locator('#connection-count').innerText()) === '0', 'customer onboarding creates zero provider connections');
  assert(await page.locator('.module-grid').isHidden(), 'customer account never inherits private platform modules');
  assert(jsErrors.length === 0, `no uncaught browser JavaScript errors (saw ${JSON.stringify(jsErrors)})`);

  await page.screenshot({ path: join(REPO_ROOT, 'logs', 'workspace-new-user-ready.png'), fullPage: true });
  writeFileSync(join(REPO_ROOT, 'logs', 'workspace-founder-pair-receipt.json'), JSON.stringify({
    contract: 'fcr/workspace-founder-chief-pair@v1',
    fcrHead: EXPECTED_HEAD_SHA,
    chiefHead: CHIEF_EXPECTED_SHA,
    chiefBaseUrl: CHIEF_AI_BASE_URL,
    workspaceId: me.body?.founder?.workspaceId,
    projectSlug: 'customer-launch-demo',
    explicitFounderApprovalObserved: true,
    providerAuthorityGranted: false,
    mergeAuthorityGranted: false,
    deploymentAuthorityGranted: false,
    executionAuthorityGranted: false,
  }, null, 2));

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
  throw new Error(`New-user workspace + real Chief Playwright proof failed with ${failures} assertion(s)`);
}

console.log('\nNew-user → real Chief → explicit approval → isolated Control Room proof passed.');
