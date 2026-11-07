import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from 'playwright';

import { createUrlFixWitnessFingerprint, type UrlFixWitnessSpec } from '../src/lib/urlfix.js';

const proofDir = resolve(process.env.URLFIX_LIVE_PROOF_DIR || 'test-results/urlfix-live-sekretbip');
mkdirSync(proofDir, { recursive: true });

const expectedSourceSha = (process.env.EXPECTED_SEKRET_SOURCE_SHA || '').trim().toLowerCase();
if (!/^[a-f0-9]{40}$/.test(expectedSourceSha)) {
  throw new Error('EXPECTED_SEKRET_SOURCE_SHA must be the exact 40-character Se’kret Bip source SHA');
}

const TARGET_ORIGIN = 'https://sekretbip.net';
const TARGET_ROUTE = '/?bipDevAudience=teen';
const TARGET_URL = `${TARGET_ORIGIN}${TARGET_ROUTE}`;
const RELEASE_URL = `${TARGET_ORIGIN}/.well-known/sekret-release.json`;
const BACKEND_HEALTH_URL = 'https://api.sekretbip.net/health';

const witnessSpec: UrlFixWitnessSpec = {
  route: TARGET_ROUTE,
  browser: 'chromium',
  viewport: { width: 390, height: 844 },
  preconditions: [
    'anonymous browser context',
    `Se’kret Bip source authority pinned to ${expectedSourceSha}`,
    'production release identities independently read before browser witness',
  ],
  actions: [
    `open ${TARGET_ROUTE}`,
    'observe Teen hero and public Enter control',
    'verify no horizontal overflow or Cloudflare Access document navigation',
    'click Enter',
    'observe /welcome and the age-gate prompt',
  ],
  expectedObservableResult: 'teen-front-door-enters-age-gate-without-access-intercept',
  expectationEvidenceRef: `jussray/Sekret-Bip@${expectedSourceSha}:e2e/production-smoke.spec.ts`,
};

function sha256File(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isCloudflareAccessUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'cloudflareaccess.com'
      || hostname.endsWith('.cloudflareaccess.com')
      || url.pathname.toLowerCase().startsWith('/cdn-cgi/access/')
    );
  } catch {
    return false;
  }
}

async function readJson(url: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await fetch(`${url}?urlfix=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache, no-store, max-age=0' },
  });
  let body: Record<string, unknown> | null = null;
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

const release = await readJson(RELEASE_URL);
const backend = await readJson(BACKEND_HEALTH_URL);
const pagesReleaseSha = String(release.body?.commitSha || '').trim().toLowerCase();
const workerReleaseSha = String(backend.body?.releaseSha || '').trim().toLowerCase();
const blockers: string[] = [];
const defects: string[] = [];

if (release.status >= 400) blockers.push(`Pages release marker returned HTTP ${release.status}`);
if (backend.status >= 400) blockers.push(`Worker health marker returned HTTP ${backend.status}`);
if (pagesReleaseSha !== expectedSourceSha) {
  blockers.push(`Pages runtime SHA ${pagesReleaseSha || 'missing'} does not match expected source ${expectedSourceSha}`);
}
if (workerReleaseSha !== expectedSourceSha) {
  blockers.push(`Worker runtime SHA ${workerReleaseSha || 'missing'} does not match expected source ${expectedSourceSha}`);
}

const tracePath = join(proofDir, 'sekret-bip-live.trace.zip');
const screenshotPath = join(proofDir, 'sekret-bip-live.png');
const receiptPath = join(proofDir, 'receipt.json');
const documentNavigations: string[] = [];
let browserStatus: number | null = null;
let finalUrl: string | null = null;
let observedResult = 'browser-witness-not-completed';
let browserError: string | null = null;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: witnessSpec.viewport });
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();
page.on('request', (request) => {
  if (request.resourceType() === 'document' && request.frame() === page.mainFrame()) {
    documentNavigations.push(request.url());
  }
});

try {
  const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 45_000 });
  browserStatus = response?.status() ?? null;
  if (!response) defects.push('public Teen front door returned no browser response');
  if (response && response.status() >= 400) defects.push(`public Teen front door returned HTTP ${response.status()}`);

  const teenHeroVisible = await page.getByTestId('web-welcome-hero-teen').isVisible({ timeout: 30_000 }).catch(() => false);
  const enterVisible = await page.getByTestId('web-welcome-enter').isVisible({ timeout: 30_000 }).catch(() => false);
  const canonCopyVisible = await page.getByText('YOUR PEOPLE. YOUR PEACE.', { exact: true }).isVisible({ timeout: 10_000 }).catch(() => false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  if (!teenHeroVisible) defects.push('Teen welcome hero is not visible');
  if (!enterVisible) defects.push('public Enter control is not visible');
  if (!canonCopyVisible) defects.push('Teen welcome canon copy is not visible');
  if (overflow) defects.push('Teen front door has horizontal overflow at 390x844');

  const accessNavigationsBeforeEnter = documentNavigations.filter(isCloudflareAccessUrl);
  if (accessNavigationsBeforeEnter.length > 0) {
    defects.push(`anonymous document navigation entered Cloudflare Access: ${accessNavigationsBeforeEnter.join(' -> ')}`);
  }

  if (enterVisible) {
    await page.getByTestId('web-welcome-enter').click();
    await page.waitForURL(/\/welcome(?:\?|$)/, { timeout: 30_000 }).catch(() => undefined);
    const ageGateVisible = await page.getByText('How old are you?', { exact: true }).isVisible({ timeout: 30_000 }).catch(() => false);
    if (!/\/welcome(?:\?|$)/.test(new URL(page.url()).pathname + new URL(page.url()).search)) {
      defects.push(`Enter did not reach Teen welcome route; observed ${page.url()}`);
    }
    if (!ageGateVisible) defects.push('Teen age-gate prompt is not visible after Enter');
  }

  const accessNavigations = documentNavigations.filter(isCloudflareAccessUrl);
  if (accessNavigations.length > 0 && !defects.some((item) => item.includes('Cloudflare Access'))) {
    defects.push(`anonymous navigation entered Cloudflare Access: ${accessNavigations.join(' -> ')}`);
  }

  finalUrl = page.url();
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  observedResult = defects.length === 0
    ? witnessSpec.expectedObservableResult
    : `defect:${defects.join(' | ')}`;
} catch (error) {
  browserError = error instanceof Error ? error.message : String(error);
  defects.push(`browser witness threw: ${browserError}`);
  finalUrl = page.url() || null;
  observedResult = `defect:${browserError}`;
  if (!existsSync(screenshotPath)) {
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' }).catch(() => undefined);
  }
} finally {
  await context.tracing.stop({ path: tracePath }).catch(() => undefined);
  await browser.close();
}

const dogfoodState = blockers.length > 0
  ? 'BLOCKED_RUNTIME_DRIFT'
  : defects.length > 0
    ? 'OBSERVED'
    : 'NOT_REPRODUCED';

const receipt = {
  schema: 'juss/urlfix-live-dogfood-observation@v1',
  projectSlug: 'sekret-bip',
  repository: 'jussray/Sekret-Bip',
  sourceAuthority: {
    ref: 'main',
    expectedSha: expectedSourceSha,
  },
  runtimeIdentity: {
    pagesReleaseUrl: RELEASE_URL,
    pagesStatus: release.status,
    pagesReleaseSha,
    workerHealthUrl: BACKEND_HEALTH_URL,
    workerStatus: backend.status,
    workerReleaseSha,
    exactSourceMatch: blockers.length === 0,
  },
  witnessSpec,
  witnessFingerprint: createUrlFixWitnessFingerprint(witnessSpec),
  observation: {
    target: 'LIVE',
    targetUrl: TARGET_URL,
    browser: 'chromium',
    browserStatus,
    finalUrl,
    evidenceMode: 'REAL',
    observedResult,
    documentNavigations,
    screenshot: sha256File(screenshotPath),
    trace: sha256File(tracePath),
    browserError,
  },
  dogfoodState,
  blockers,
  defects,
  authority: {
    sourceMutationAllowed: false,
    mergeAuthorityGranted: false,
    reason: dogfoodState === 'OBSERVED'
      ? 'A live defect is observed; Goalfix must independently reacquire source authority before mutation.'
      : dogfoodState === 'NOT_REPRODUCED'
        ? 'The witness passed; no repair authority exists because no defect was reproduced.'
        : 'Runtime identity does not match the pinned source; repair authority is blocked.',
  },
};

writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ dogfoodState, blockers, defects, receiptPath }));

if (dogfoodState === 'BLOCKED_RUNTIME_DRIFT') process.exitCode = 3;
if (dogfoodState === 'OBSERVED') process.exitCode = 2;
