import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 8812;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FOUNDER_EMAIL = 'tenant-founder@example.com';
const WORKSPACE_ID = 'tenant-workspace-a';
const FOREIGN_WORKSPACE_ID = 'tenant-workspace-b';
const FOREIGN_PROJECT_SLUG = 'foreign-project';
const FOREIGN_MISSION_ID = 'tenant-foreign-mission';
const FOREIGN_TERMINAL_RUN_ID = 'tenant-foreign-terminal-run';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const BRIDGE_FILE = join(HERE, '.tenant-auth-bridge.json');

if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // server not listening yet
    }
    await sleep(100);
  }
  throw new Error('Tenant-isolation proof server did not become healthy');
}

async function waitForBridge() {
  for (let i = 0; i < 60; i += 1) {
    if (existsSync(BRIDGE_FILE)) return JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
    await sleep(50);
  }
  throw new Error('Magic-link auth bridge did not appear');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
}

const server = spawn(
  process.execPath,
  [
    '--import',
    new URL('./register-loader.mjs', import.meta.url).pathname,
    new URL('../dist/index.js', import.meta.url).pathname,
  ],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
      SUPABASE_PUBLISHABLE_KEY: 'fake-publishable-key',
      FOUNDER_EMAIL,
      E2E_SEED_FOUNDER_EMAIL: FOUNDER_EMAIL,
      E2E_WORKSPACE_ID: WORKSPACE_ID,
      E2E_SEED_FOREIGN_TENANT: 'true',
      E2E_FOREIGN_WORKSPACE_ID: FOREIGN_WORKSPACE_ID,
      E2E_FOREIGN_PROJECT_SLUG: FOREIGN_PROJECT_SLUG,
      E2E_FOREIGN_MISSION_ID: FOREIGN_MISSION_ID,
      E2E_FOREIGN_TERMINAL_RUN_ID: FOREIGN_TERMINAL_RUN_ID,
      E2E_AUTH_BRIDGE_FILE: BRIDGE_FILE,
      FOUNDER_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64url'),
      FOUNDER_API_URL: BASE_URL,
      FOUNDER_ALLOWED_ORIGINS: BASE_URL,
      CONTROL_ROOM_TERMINAL_ENABLED: 'true',
      PORT: String(PORT),
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(`${BASE_URL}/control-room/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#magic-link-form');
  await page.fill('#magic-link-form input[name="email"]', FOUNDER_EMAIL);
  await page.click('#magic-link-form button[type="submit"]');

  const bridge = await waitForBridge();
  assert(Boolean(bridge.tokenHash), 'magic-link request produced a real callback token');

  await page.goto(`${BASE_URL}/auth/callback?token_hash=${bridge.tokenHash}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.founder-email');
  assert(
    (await page.locator('.founder-email').innerText()).trim().toLowerCase() === FOUNDER_EMAIL,
    'founder authenticated through the real browser callback flow',
  );

  const foreignRegistry = await page.evaluate(async ({ foreignWorkspaceId }) => {
    const response = await fetch('/projects', {
      credentials: 'same-origin',
      headers: { 'x-fcr-workspace-id': foreignWorkspaceId },
    });
    return { status: response.status, body: await response.json() };
  }, { foreignWorkspaceId: FOREIGN_WORKSPACE_ID });

  assert(foreignRegistry.status === 403, 'foreign workspace registry read is rejected');
  assert(
    /not available to this founder/i.test(String(foreignRegistry.body?.error ?? '')),
    'foreign workspace rejection is membership-specific',
  );

  const foreignCreate = await page.evaluate(async ({ foreignWorkspaceId }) => {
    const response = await fetch('/projects', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-fcr-workspace-id': foreignWorkspaceId,
      },
      body: JSON.stringify({ slug: 'attacker-project', name: 'Attacker Project' }),
    });
    return { status: response.status, body: await response.json() };
  }, { foreignWorkspaceId: FOREIGN_WORKSPACE_ID });

  assert(foreignCreate.status === 403, 'foreign workspace project creation is rejected');

  const foreignResourceChecks = await page.evaluate(async ({ projectSlug, missionId, runId }) => {
    async function read(path) {
      const response = await fetch(path, { credentials: 'same-origin' });
      return { path, status: response.status, body: await response.json() };
    }
    async function mutate(path) {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionType: 'merge', idempotencyKey: 'foreign-tenant-proof' }),
      });
      return { path, status: response.status, body: await response.json() };
    }
    return [
      await read(`/projects/${projectSlug}/verification`),
      await read(`/missions/${missionId}/council`),
      await mutate(`/approvals/${missionId}/execute`),
      await read(`/terminal/${projectSlug}/commands`),
      await read(`/terminal/runs/${runId}`),
      await read(`/command-bridge/${projectSlug}/commands`),
    ];
  }, {
    projectSlug: FOREIGN_PROJECT_SLUG,
    missionId: FOREIGN_MISSION_ID,
    runId: FOREIGN_TERMINAL_RUN_ID,
  });

  for (const check of foreignResourceChecks) {
    assert(check.status === 404, `${check.path} hides the foreign resource behind active-workspace ownership`);
    assert(
      /resource not found in the active workspace/i.test(String(check.body?.error ?? '')),
      `${check.path} returns the tenant-safe not-found boundary`,
    );
  }

  const foreignCommandRequest = await page.evaluate(async ({ projectSlug }) => {
    const response = await fetch('/command-bridge/requests', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectSlug }),
    });
    return { status: response.status, body: await response.json() };
  }, { projectSlug: FOREIGN_PROJECT_SLUG });
  assert(foreignCommandRequest.status === 404, 'Command Bridge body-carried foreign project is rejected before command validation');
  assert(
    /resource not found in the active workspace/i.test(String(foreignCommandRequest.body?.error ?? '')),
    'Command Bridge foreign project body uses the tenant-safe not-found boundary',
  );

  await page.goto(`${BASE_URL}/control-room/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#new-project-form');
  await page.fill('#new-project-form input[name="slug"]', 'tenant-proof-project');
  await page.fill('#new-project-form input[name="name"]', 'Tenant Proof Project');
  await page.click('#new-project-form button[type="submit"]');
  await page.waitForSelector('#project-list .card');
  assert(
    (await page.locator('#project-list').innerText()).includes('Tenant Proof Project'),
    'active workspace can create and read its own project through the real UI',
  );
  assert(
    !(await page.locator('#project-list').innerText()).includes('Foreign Project'),
    'foreign seeded project never appears in the active founder project list',
  );

  const activeState = await page.evaluate(async () => {
    const response = await fetch('/onboarding/state', { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  });
  assert(activeState.status === 200, 'workspace onboarding state remains usable after project creation');
  assert(activeState.body?.activeWorkspace?.id === WORKSPACE_ID, 'onboarding state binds to the seeded workspace');
  assert(
    activeState.body?.authorityBoundary?.publicSignupEnabled === false,
    'public signup remains explicitly disabled during tenant-boundary rollout',
  );

  const projectRows = Array.isArray(activeState.body?.projects) ? activeState.body.projects : [];
  assert(
    projectRows.some((project) => project.slug === 'tenant-proof-project' && project.workspaceId === WORKSPACE_ID),
    'created project is bound to the active workspace',
  );
  assert(
    projectRows.every((project) => project.workspaceId === WORKSPACE_ID),
    'onboarding state exposes no project outside the active workspace',
  );

  mkdirSync(join(ROOT, 'test-results'), { recursive: true });
  await page.screenshot({
    path: join(ROOT, 'test-results', 'tenant-isolation-mobile.png'),
    fullPage: true,
  });
  assert(pageErrors.length === 0, `browser raised no uncaught page errors: ${JSON.stringify(pageErrors)}`);

  console.log('TENANT_ISOLATION_PLAYWRIGHT_PROOF=PASS');
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);
}
