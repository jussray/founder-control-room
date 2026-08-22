import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..');
const outputDir = resolve(repositoryRoot, 'test-results/bip-live-demo');
const expectedFcrHead = process.env.EXPECTED_HEAD_SHA?.trim().toLowerCase() || null;

execFileSync('npm', ['run', 'build'], { cwd: repositoryRoot, stdio: 'inherit' });

const moduleUrl = pathToFileURL(resolve(repositoryRoot, 'dist/config/demoPortfolio.js')).href;
const { BIP_LIVE_PRODUCT_DEMO } = await import(`${moduleUrl}?proof=${Date.now()}`);

const fcrHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim().toLowerCase();

if (expectedFcrHead) {
  assert.equal(fcrHead, expectedFcrHead, 'Bip live demo proof must run on the exact FCR head');
}

async function resolveCanonicalSourceMainSha() {
  const response = await fetch(
    `https://api.github.com/repos/${BIP_LIVE_PRODUCT_DEMO.canonicalRepository}/commits/${BIP_LIVE_PRODUCT_DEMO.canonicalBranch}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'founder-control-room-bip-live-demo-proof',
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  assert.equal(response.ok, true, `canonical source main lookup failed with HTTP ${response.status}`);
  const body = await response.json();
  const sha = typeof body?.sha === 'string' ? body.sha.trim().toLowerCase() : '';
  assert.match(sha, /^[0-9a-f]{40}$/, 'canonical Se’kret Bip main must resolve to a full commit SHA');
  return sha;
}

function isCloudflareAccessHost(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return hostname === 'cloudflareaccess.com' || hostname.endsWith('.cloudflareaccess.com');
  } catch {
    return false;
  }
}

async function assertNormalAnonymousSurface(page, response, label) {
  const title = await page.title().catch(() => '');
  const bodyText = (await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')).toLowerCase();
  const accessPathMarkers = await page
    .locator('a[href*="/cdn-cgi/access/"], form[action*="/cdn-cgi/access/"]')
    .count()
    .catch(() => 0);
  const sameHostAccessBlock =
    accessPathMarkers > 0 ||
    (bodyText.includes('cloudflare access') &&
      (bodyText.includes('sign in') || bodyText.includes('does not have access')));
  const accessIntercepted =
    isCloudflareAccessHost(page.url()) || /cloudflare access/i.test(title) || sameHostAccessBlock;

  if (accessIntercepted) {
    throw new Error(`BIP_LIVE_DEMO_BLOCKED_BY_CLOUDFLARE_ACCESS surface=${label}`);
  }

  assert(response, `${label}: navigation must return a response`);
  assert(response.ok(), `${label}: anonymous navigation returned HTTP ${response.status()}`);
}

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${label}: page must not overflow mobile viewport`);
  return dimensions;
}

await mkdir(outputDir, { recursive: true });
const sourceMainShaObserved = await resolveCanonicalSourceMainSha();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const screenshots = [];
const protectedRouteResults = [];

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const sensitiveAuthMutations = [];

  page.on('request', (request) => {
    const method = request.method().toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    if (/\/auth\/v1\/(signup|token|recover|user)/i.test(request.url())) {
      sensitiveAuthMutations.push({ method, pathname: new URL(request.url()).pathname });
    }
  });

  const entryUrl = new URL(BIP_LIVE_PRODUCT_DEMO.journey.entryPath, BIP_LIVE_PRODUCT_DEMO.liveUrl).toString();
  const entryResponse = await page.goto(entryUrl, { waitUntil: 'networkidle', timeout: 45_000 });
  await assertNormalAnonymousSurface(page, entryResponse, 'teen-front-door');

  await page.getByTestId('web-welcome-hero-teen').waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal((await page.getByText('YOUR PEOPLE. YOUR PEACE.', { exact: true }).count()) > 0, true);
  assert.equal((await page.getByText('Come on in.', { exact: true }).count()) > 0, true);
  await page.getByTestId(BIP_LIVE_PRODUCT_DEMO.journey.enterTestId).waitFor({ state: 'visible' });
  const frontDoorDimensions = await expectNoHorizontalOverflow(page, 'teen-front-door');

  const frontDoorScreenshot = resolve(outputDir, 'teen-front-door-mobile.png');
  await page.screenshot({ path: frontDoorScreenshot, fullPage: true, animations: 'disabled' });
  screenshots.push('test-results/bip-live-demo/teen-front-door-mobile.png');

  await page.getByTestId(BIP_LIVE_PRODUCT_DEMO.journey.enterTestId).click();
  await page.waitForURL((url) => url.pathname === BIP_LIVE_PRODUCT_DEMO.journey.stopPath, { timeout: 30_000 });
  await page.getByText('How old are you?').waitFor({ state: 'visible', timeout: 30_000 });
  const onboardingDimensions = await expectNoHorizontalOverflow(page, 'teen-onboarding-boundary');
  assert.equal(sensitiveAuthMutations.length, 0, 'demo must stop before any auth mutation request');

  const onboardingScreenshot = resolve(outputDir, 'teen-onboarding-boundary-mobile.png');
  await page.screenshot({ path: onboardingScreenshot, fullPage: true, animations: 'disabled' });
  screenshots.push('test-results/bip-live-demo/teen-onboarding-boundary-mobile.png');
  await context.close();

  for (const protectedRoute of BIP_LIVE_PRODUCT_DEMO.journey.protectedRoutes) {
    const protectedContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const protectedPage = await protectedContext.newPage();
    const protectedUrl = new URL(protectedRoute, BIP_LIVE_PRODUCT_DEMO.liveUrl).toString();
    const protectedResponse = await protectedPage.goto(protectedUrl, { waitUntil: 'networkidle', timeout: 45_000 });
    await assertNormalAnonymousSurface(protectedPage, protectedResponse, `protected:${protectedRoute}`);

    if (protectedRoute === '/comfort') {
      await protectedPage.getByTestId('web-welcome-enter').waitFor({ state: 'visible', timeout: 30_000 });
      assert.equal(await protectedPage.getByText('Grounding Steps').count(), 0, '/comfort must not expose protected teen content');
    } else if (protectedRoute === '/approvals') {
      await protectedPage.getByText('sign in to continue', { exact: false }).waitFor({ state: 'visible', timeout: 30_000 });
      await protectedPage.getByRole('button', { name: 'Log in' }).waitFor({ state: 'visible', timeout: 30_000 });
      assert.equal(await protectedPage.getByText('To Review').count(), 0, '/approvals must not expose protected parent content');
    } else {
      throw new Error(`Unproved protected route in demo contract: ${protectedRoute}`);
    }

    const dimensions = await expectNoHorizontalOverflow(protectedPage, `protected:${protectedRoute}`);
    protectedRouteResults.push({ route: protectedRoute, result: 'protected', dimensions });
    await protectedContext.close();
  }

  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    result: 'passed',
    contractId: BIP_LIVE_PRODUCT_DEMO.id,
    fcrHead,
    source: {
      repository: BIP_LIVE_PRODUCT_DEMO.canonicalRepository,
      branch: BIP_LIVE_PRODUCT_DEMO.canonicalBranch,
      mainShaObserved: sourceMainShaObserved,
      observation: 'source-provenance-only',
    },
    runtime: {
      liveUrl: BIP_LIVE_PRODUCT_DEMO.liveUrl,
      visitorMode: BIP_LIVE_PRODUCT_DEMO.visitorMode,
      exactSourceShaClaimed: false,
    },
    authorityBoundary: BIP_LIVE_PRODUCT_DEMO.authorityBoundary,
    journey: {
      entryPath: BIP_LIVE_PRODUCT_DEMO.journey.entryPath,
      stopPath: BIP_LIVE_PRODUCT_DEMO.journey.stopPath,
      sensitiveAuthMutationRequests: 0,
      frontDoorDimensions,
      onboardingDimensions,
      protectedRoutes: protectedRouteResults,
    },
    screenshots,
  };

  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
