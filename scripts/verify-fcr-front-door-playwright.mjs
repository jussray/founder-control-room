import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const APEX_ORIGIN = 'https://foundercontrolroom.org';
const PUBLIC_ORIGIN = 'https://www.foundercontrolroom.org';
const WEB_ORIGIN = PUBLIC_ORIGIN;
const CONTROL_ROOM_URL = `${PUBLIC_ORIGIN}/control-room/`;
const AUTH_ME_URL = `${PUBLIC_ORIGIN}/auth/me`;
const API_VERSION_URL = 'https://api.foundercontrolroom.org/version';
const RECEIPT_PATH = 'test-results/fcr-access-front-door-browser-proof.json';
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() ?? '';

if (!/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
  throw new Error('EXPECTED_HEAD_SHA must be an exact lowercase 40-character SHA.');
}

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const receipt = {
  schemaVersion: 1,
  scope: 'fcr-access-front-door-browser-proof',
  observedAt: new Date().toISOString(),
  expectedHeadSha,
  audience: 'random-stranger',
  requestedOrigin: APEX_ORIGIN,
  publicOrigin: PUBLIC_ORIGIN,
  finalOrigin: null,
  navigationStatus: null,
  publicCanonicalHref: null,
  controlRoomStatus: null,
  founderSignInVisible: false,
  founderShellVisible: false,
  authMeStatus: null,
  founderAuthorityContained: false,
  apiVersionStatus: null,
  apiVersionMatchesExpectedSha: false,
  state: 'unknown',
};

function assertNoCloudflareIntercept(url, body) {
  if (/cloudflareaccess\.com/i.test(url) || /Error\s+5(?:00|02|03|04|20|21|22|23|24|25|26)/i.test(body)) {
    throw new Error('Random stranger was intercepted by Cloudflare Access or a Cloudflare server error before reaching FCR.');
  }
}

try {
  const response = await page.goto(APEX_ORIGIN, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  if (!response) throw new Error('Founder Control Room returned no public-front-door navigation response.');

  receipt.navigationStatus = response.status();
  if (response.status() >= 500) {
    throw new Error(`Founder Control Room public front door returned HTTP ${response.status()}.`);
  }

  receipt.finalOrigin = new URL(page.url()).origin;
  if (receipt.finalOrigin !== APEX_ORIGIN && receipt.finalOrigin !== WEB_ORIGIN) {
    throw new Error(`Public front door redirected outside FCR to ${receipt.finalOrigin}.`);
  }

  const publicBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 8_000);
  assertNoCloudflareIntercept(page.url(), publicBody);

  receipt.publicCanonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href');
  if (receipt.publicCanonicalHref !== `${PUBLIC_ORIGIN}/`) {
    throw new Error(`Public front door canonical URL must be ${PUBLIC_ORIGIN}/.`);
  }

  const enterLink = page.getByRole('link', { name: /Enter authenticated Control Room/i });
  if (await enterLink.count() !== 1) {
    throw new Error('Public front door must expose exactly one authenticated Control Room entry link.');
  }

  const controlRoomResponse = await page.goto(CONTROL_ROOM_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  if (!controlRoomResponse) throw new Error('Founder Control Room returned no Control Room navigation response.');

  receipt.controlRoomStatus = controlRoomResponse.status();
  if (controlRoomResponse.status() >= 500) {
    throw new Error(`Control Room entry surface returned HTTP ${controlRoomResponse.status()}.`);
  }

  const controlRoomBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 8_000);
  assertNoCloudflareIntercept(page.url(), controlRoomBody);

  const signIn = page.locator('.sign-in-wrap');
  await signIn.waitFor({ state: 'visible', timeout: 20_000 });
  receipt.founderSignInVisible = await signIn.isVisible().catch(() => false);
  receipt.founderShellVisible = await page.locator('.shell').isVisible().catch(() => false);

  const signInCopy = (await signIn.innerText().catch(() => '')).slice(0, 4_000);
  if (!receipt.founderSignInVisible
      || !/Sign in with your founder email/i.test(signInCopy)
      || !/allowlist/i.test(signInCopy)
      || !await page.locator('#magic-link-form').isVisible().catch(() => false)) {
    throw new Error('Random stranger did not reach the founder-gated sign-in surface.');
  }

  if (receipt.founderShellVisible) {
    throw new Error('Random stranger reached the authenticated Founder Control Room shell without founder authority.');
  }

  const authMeResponse = await context.request.get(AUTH_ME_URL, { timeout: 20_000 });
  receipt.authMeStatus = authMeResponse.status();
  if (receipt.authMeStatus !== 401) {
    throw new Error(`Founder identity endpoint must reject a random stranger with HTTP 401, received ${receipt.authMeStatus}.`);
  }

  receipt.founderAuthorityContained = (
    receipt.founderSignInVisible
    && !receipt.founderShellVisible
    && receipt.authMeStatus === 401
  );
  if (!receipt.founderAuthorityContained) {
    throw new Error('Founder authority containment was not proven for a random stranger.');
  }

  const versionResponse = await context.request.get(API_VERSION_URL, { timeout: 20_000 });
  receipt.apiVersionStatus = versionResponse.status();
  if (!versionResponse.ok()) {
    throw new Error(`${API_VERSION_URL} returned HTTP ${versionResponse.status()}.`);
  }

  const versionPayload = await versionResponse.text();
  receipt.apiVersionMatchesExpectedSha = versionPayload.includes(expectedHeadSha);
  if (!receipt.apiVersionMatchesExpectedSha) {
    throw new Error('API /version is not serving the exact approved current-main SHA.');
  }

  receipt.state = 'proven';
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  receipt.state = 'failed';
  receipt.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(receipt, null, 2));
  process.exitCode = 1;
} finally {
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await browser.close();
}
