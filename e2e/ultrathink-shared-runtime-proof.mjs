import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const REPO_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PORT = 8813;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FOUNDER_EMAIL = 'founder@example.com';
const BRIDGE_FILE = join(REPO_ROOT, 'e2e', '.ultrathink-auth-bridge.json');
const RESULTS_ROOT = join(REPO_ROOT, 'test-results');
const INTENT = '/ultrathink Decide the smallest safe shared-runtime architecture change.';

if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);
mkdirSync(RESULTS_ROOT, { recursive: true });

const server = spawn(
  process.execPath,
  ['--import', join(REPO_ROOT, 'e2e', 'register-loader.mjs'), join(REPO_ROOT, 'dist', 'index.js')],
  {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
      SUPABASE_PUBLISHABLE_KEY: 'fake-publishable-key',
      FOUNDER_EMAIL,
      E2E_SEED_FOUNDER_EMAIL: FOUNDER_EMAIL,
      E2E_AUTH_BRIDGE_FILE: BRIDGE_FILE,
      FOUNDER_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64url'),
      FOUNDER_API_URL: BASE_URL,
      FOUNDER_ALLOWED_ORIGINS: BASE_URL,
      GITHUB_TOKEN: 'fake-github-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

async function waitForServer() {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(100);
  }
  throw new Error(`FCR server did not become healthy.\n${serverLog.slice(-4_000)}`);
}

async function waitForBridge() {
  for (let index = 0; index < 80; index += 1) {
    if (existsSync(BRIDGE_FILE)) return JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
    await sleep(50);
  }
  throw new Error('Founder magic-link bridge was not emitted.');
}

async function browserPost(page, body) {
  return page.evaluate(async ({ baseUrl, payload }) => {
    const response = await fetch(`${baseUrl}/capabilities/ultrathink-shared-reasoning-v1/runs`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  }, { baseUrl: BASE_URL, payload: body });
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });

  const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const anonymousPage = await anonymous.newPage();
  const anonymousResult = await anonymousPage.evaluate(async ({ baseUrl, intent }) => {
    const response = await fetch(`${baseUrl}/capabilities/ultrathink-shared-reasoning-v1/runs`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surface: 'voice', intent }),
    });
    return { status: response.status, body: await response.json() };
  }, { baseUrl: BASE_URL, intent: INTENT });
  if (anonymousResult.status !== 401) {
    throw new Error(`Anonymous ULTRATHINK runtime access must fail closed, got ${anonymousResult.status}`);
  }
  await anonymous.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${BASE_URL}/control-room/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#magic-link-form');
  await page.fill('input[name="email"]', FOUNDER_EMAIL);
  await page.click('#magic-link-form button[type=submit]');
  const bridge = await waitForBridge();
  if (!bridge?.tokenHash) throw new Error('Magic-link bridge did not contain tokenHash.');

  await page.goto(`${BASE_URL}/auth/callback?token_hash=${encodeURIComponent(bridge.tokenHash)}`, { waitUntil: 'networkidle' });

  const text = await browserPost(page, { surface: 'text', intent: INTENT });
  if (text.status !== 200) throw new Error(`Text ULTRATHINK resolution failed: ${JSON.stringify(text)}`);
  const textRuntime = text.body?.run?.sharedRuntime;
  if (
    text.body?.run?.authority !== 'reason_only'
    || text.body?.run?.mutationAllowed !== false
    || text.body?.run?.providerExecution !== false
    || textRuntime?.command !== '/ultrathink'
    || textRuntime?.continuity?.transition !== 'initial'
    || textRuntime?.continuity?.authorityEffect !== 'none'
    || textRuntime?.completionClaim?.allowed !== false
  ) {
    throw new Error(`Text ULTRATHINK receipt violated the non-authorizing contract: ${JSON.stringify(text.body)}`);
  }

  const voice = await browserPost(page, {
    surface: 'voice',
    intent: INTENT,
    priorEvidenceFingerprint: textRuntime.continuity.evidenceFingerprint,
    priorProofCookie: textRuntime.continuity.proofCookie,
  });
  if (voice.status !== 200) throw new Error(`Voice ULTRATHINK resolution failed: ${JSON.stringify(voice)}`);
  const voiceRuntime = voice.body?.run?.sharedRuntime;
  if (
    voiceRuntime?.surface !== 'voice'
    || voice.body?.run?.presentation?.channel !== 'speech_and_text'
    || voiceRuntime?.continuity?.transition !== 'confirmed'
    || voiceRuntime?.continuity?.evidenceFingerprint !== textRuntime.continuity.evidenceFingerprint
    || voiceRuntime?.runtimeAuthority?.authorityRevision !== textRuntime.runtimeAuthority.authorityRevision
    || voiceRuntime?.requestFingerprint === textRuntime.requestFingerprint
  ) {
    throw new Error(`Voice/text continuity did not preserve one semantic authority chain: ${JSON.stringify({ text: text.body, voice: voice.body })}`);
  }

  const invalid = await browserPost(page, { surface: 'voice', intent: 'Reason deeply without the command.' });
  if (invalid.status !== 400 || invalid.body?.code !== 'shared_runtime_invalid_request') {
    throw new Error(`Missing /ultrathink command must fail closed: ${JSON.stringify(invalid)}`);
  }

  await page.goto(`${BASE_URL}/control-room/capabilities.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.workbench');
  await page.fill('#capability-search', 'ultrathink');
  await page.waitForSelector('[data-id="ultrathink-shared-reasoning-v1"]');
  const cardText = await page.locator('[data-id="ultrathink-shared-reasoning-v1"]').innerText();
  if (!cardText.toLowerCase().includes('ultrathink')) {
    throw new Error(`Capability Workbench did not render the ULTRATHINK runtime entry: ${cardText}`);
  }
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) {
    throw new Error(`ULTRATHINK capability workbench overflows mobile viewport: ${JSON.stringify(overflow)}`);
  }
  if (pageErrors.length > 0) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);

  const evidence = {
    contract: 'fcr/ultrathink-shared-runtime-playwright@v1',
    anonymousStatus: anonymousResult.status,
    text: text.body.run,
    voice: voice.body.run,
    invalidStatus: invalid.status,
    verified: {
      opaqueFounderSession: true,
      realHttpRoute: true,
      semanticContinuityAcrossTextAndVoice: true,
      providerExecution: false,
      mutationAllowed: false,
      authorityEffect: 'none',
      completionClaimAllowed: false,
    },
  };
  writeFileSync(join(RESULTS_ROOT, 'ultrathink-shared-runtime-receipt.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({
    path: join(RESULTS_ROOT, 'ultrathink-shared-runtime-mobile.png'),
    fullPage: true,
  });

  console.log('PASS: ULTRATHINK resolves through the real founder-authenticated shared runtime across text and voice without provider execution or mutation authority.');
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);
}
