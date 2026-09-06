import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const WEB_ORIGIN = 'https://foundercontrolroom.org';
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
  requestedOrigin: WEB_ORIGIN,
  finalOrigin: null,
  navigationStatus: null,
  canonicalHref: null,
  publicDestinations: [],
  relativePublicLinks: [],
  apiVersionStatus: null,
  apiVersionMatchesExpectedSha: false,
  state: 'unknown',
};

try {
  const response = await page.goto(WEB_ORIGIN, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  if (!response) throw new Error('Founder Control Room returned no navigation response.');

  receipt.navigationStatus = response.status();
  if (response.status() >= 500) {
    throw new Error(`Founder Control Room returned HTTP ${response.status()}.`);
  }

  receipt.finalOrigin = new URL(page.url()).origin;
  if (receipt.finalOrigin !== WEB_ORIGIN) {
    throw new Error(`Front door redirected away from ${WEB_ORIGIN} to ${receipt.finalOrigin}.`);
  }

  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 4_000);
  if (/cloudflareaccess\.com/i.test(page.url()) || /Error\s+5(?:00|02|03|04|20|21|22|23|24|25|26)/i.test(body)) {
    throw new Error('Front door still resolves to Cloudflare Access or a Cloudflare server error.');
  }

  receipt.canonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href');
  if (receipt.canonicalHref !== `${WEB_ORIGIN}/`) {
    throw new Error(`Front door canonical URL must be ${WEB_ORIGIN}/.`);
  }

  const publicLinks = await page.locator('a[href]').evaluateAll((links) => links.map((link) => ({
    href: link.getAttribute('href') ?? '',
    text: link.textContent?.trim() ?? '',
  })));
  receipt.publicDestinations = publicLinks.map(({ href }) => href);
  receipt.relativePublicLinks = publicLinks
    .filter(({ href }) => href.startsWith('/'))
    .map(({ href, text }) => ({ href, text }));

  if (receipt.relativePublicLinks.length > 0) {
    throw new Error(`Front door still contains origin-relative public links: ${JSON.stringify(receipt.relativePublicLinks)}.`);
  }

  for (const requiredHref of [
    `${WEB_ORIGIN}/control-room/`,
    `${WEB_ORIGIN}/guardrails`,
  ]) {
    if (!receipt.publicDestinations.includes(requiredHref)) {
      throw new Error(`Front door is missing required canonical HTTPS destination ${requiredHref}.`);
    }
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
