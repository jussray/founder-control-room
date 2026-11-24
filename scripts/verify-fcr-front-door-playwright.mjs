import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const APEX_ORIGIN = 'https://foundercontrolroom.org';
const PUBLIC_ORIGIN = 'https://www.foundercontrolroom.org';
const CONTROL_ROOM_URL = `${PUBLIC_ORIGIN}/control-room/`;
const AUTH_ME_URL = `${PUBLIC_ORIGIN}/auth/me`;
const PUBLIC_HEALTH_URL = `${PUBLIC_ORIGIN}/health`;
const API_VERSION_URL = 'https://api.foundercontrolroom.org/version';
const PROTECTED_API_HEALTH_URL = 'https://api.foundercontrolroom.org/health';
const EXPECTED_API_SERVICE = 'founder-control-room';
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
  publicHealthStatus: null,
  publicHealthServiceIdentity: null,
  publicHealthReachesCanonicalWorker: false,
  apiVersionStatus: null,
  apiVersionMatchesExpectedSha: false,
  protectedApiHealthStatus: null,
  protectedApiHealthRedirectIsAccess: false,
  protectedApiHealthDeniedToStranger: false,
  state: 'unknown',
};

function cloudflareInterceptDetected(url, body) {
  return /cloudflareaccess\.com/i.test(url)
    || /Error\s+5(?:00|02|03|04|20|21|22|23|24|25|26)/i.test(body);
}

const failures = [];
function fail(message) {
  failures.push(message);
}

try {
  try {
    const apexResponse = await page.goto(APEX_ORIGIN, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (!apexResponse) {
      fail('Founder Control Room returned no apex navigation response.');
    } else {
      receipt.navigationStatus = apexResponse.status();
      receipt.finalOrigin = new URL(page.url()).origin;
      if (apexResponse.status() >= 400) {
        fail(`Founder Control Room apex returned HTTP ${apexResponse.status()}.`);
      }
      if (receipt.finalOrigin !== APEX_ORIGIN && receipt.finalOrigin !== PUBLIC_ORIGIN) {
        fail(`Apex redirected outside FCR to ${receipt.finalOrigin}.`);
      }
      const apexBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 8_000);
      if (cloudflareInterceptDetected(page.url(), apexBody)) {
        fail('Apex was intercepted by Cloudflare Access or a Cloudflare server error before reaching FCR.');
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  // Always probe the canonical public origin independently. A broken apex must
  // not prevent us from learning whether the random-stranger path and founder
  // containment are healthy at the canonical FCR surface.
  try {
    const publicResponse = await page.goto(PUBLIC_ORIGIN, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (!publicResponse) {
      fail('Founder Control Room returned no canonical public-front-door response.');
    } else {
      receipt.finalOrigin = new URL(page.url()).origin;
      if (publicResponse.status() >= 400) {
        fail(`Canonical public front door returned HTTP ${publicResponse.status()}.`);
      }
      if (receipt.finalOrigin !== PUBLIC_ORIGIN) {
        fail(`Canonical public front door redirected outside FCR to ${receipt.finalOrigin}.`);
      }
      const publicBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 8_000);
      if (cloudflareInterceptDetected(page.url(), publicBody)) {
        fail('Canonical public front door was intercepted by Cloudflare Access or a Cloudflare server error.');
      }
      receipt.publicCanonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
      if (receipt.publicCanonicalHref !== `${PUBLIC_ORIGIN}/`) {
        fail(`Public front door canonical URL must be ${PUBLIC_ORIGIN}/.`);
      }
      const enterLinkCount = await page.getByRole('link', { name: /Enter authenticated Control Room/i }).count().catch(() => 0);
      if (enterLinkCount !== 1) {
        fail('Public front door must expose exactly one authenticated Control Room entry link.');
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  try {
    const controlRoomResponse = await page.goto(CONTROL_ROOM_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (!controlRoomResponse) {
      fail('Founder Control Room returned no Control Room navigation response.');
    } else {
      receipt.controlRoomStatus = controlRoomResponse.status();
      if (controlRoomResponse.status() >= 400) {
        fail(`Control Room entry surface returned HTTP ${controlRoomResponse.status()}.`);
      }
      const controlRoomBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 8_000);
      if (cloudflareInterceptDetected(page.url(), controlRoomBody)) {
        fail('Control Room entry surface was intercepted by Cloudflare Access or a Cloudflare server error.');
      }

      const signIn = page.locator('.sign-in-wrap');
      receipt.founderSignInVisible = await signIn.isVisible().catch(() => false);
      receipt.founderShellVisible = await page.locator('.shell').isVisible().catch(() => false);
      const signInCopy = receipt.founderSignInVisible
        ? (await signIn.innerText().catch(() => '')).slice(0, 4_000)
        : '';
      const magicLinkVisible = await page.locator('#magic-link-form').isVisible().catch(() => false);
      if (!receipt.founderSignInVisible
          || !/Sign in with your founder email/i.test(signInCopy)
          || !/allowlist/i.test(signInCopy)
          || !magicLinkVisible) {
        fail('Random stranger did not reach the founder-gated sign-in surface.');
      }
      if (receipt.founderShellVisible) {
        fail('Random stranger reached the authenticated Founder Control Room shell without founder authority.');
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  try {
    const authMeResponse = await context.request.get(AUTH_ME_URL, { timeout: 20_000 });
    receipt.authMeStatus = authMeResponse.status();
    if (receipt.authMeStatus !== 401) {
      fail(`Founder identity endpoint must reject a random stranger with HTTP 401, received ${receipt.authMeStatus}.`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  receipt.founderAuthorityContained = (
    receipt.founderSignInVisible
    && !receipt.founderShellVisible
    && receipt.authMeStatus === 401
  );
  if (!receipt.founderAuthorityContained) {
    fail('Founder authority containment was not proven for a random stranger.');
  }

  // The normal browser API path is the Pages FCR_API Service Binding, not the
  // externally Access-protected api.* hostname. Prove the public host reaches
  // the canonical Worker through that binding before considering the front
  // door healthy.
  try {
    const healthResponse = await context.request.get(PUBLIC_HEALTH_URL, { timeout: 20_000 });
    receipt.publicHealthStatus = healthResponse.status();
    receipt.publicHealthServiceIdentity = healthResponse.headers()['x-founder-control-room-service'] ?? null;
    receipt.publicHealthReachesCanonicalWorker = healthResponse.ok()
      && receipt.publicHealthServiceIdentity === EXPECTED_API_SERVICE;
    if (!receipt.publicHealthReachesCanonicalWorker) {
      fail(`Public /health did not prove the canonical ${EXPECTED_API_SERVICE} Worker through the Pages service binding.`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  try {
    const versionResponse = await context.request.get(API_VERSION_URL, { timeout: 20_000 });
    receipt.apiVersionStatus = versionResponse.status();
    if (!versionResponse.ok()) {
      fail(`${API_VERSION_URL} returned HTTP ${versionResponse.status()}.`);
    } else {
      const versionPayload = await versionResponse.text();
      receipt.apiVersionMatchesExpectedSha = versionPayload.includes(expectedHeadSha);
      if (!receipt.apiVersionMatchesExpectedSha) {
        fail('API /version is not serving the exact approved current-main SHA.');
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  // /version is the only intentionally public api.* path in the split model.
  // A different api.* route must still hit Access for a random stranger.
  try {
    const protectedResponse = await context.request.get(PROTECTED_API_HEALTH_URL, {
      timeout: 20_000,
      maxRedirects: 0,
    });
    receipt.protectedApiHealthStatus = protectedResponse.status();
    const location = protectedResponse.headers().location ?? '';
    receipt.protectedApiHealthRedirectIsAccess = /cloudflareaccess\.com/i.test(location);
    receipt.protectedApiHealthDeniedToStranger = [401, 403].includes(receipt.protectedApiHealthStatus)
      || (receipt.protectedApiHealthStatus >= 300
        && receipt.protectedApiHealthStatus < 400
        && receipt.protectedApiHealthRedirectIsAccess);
    if (!receipt.protectedApiHealthDeniedToStranger) {
      fail(`Protected API /health unexpectedly became public with HTTP ${receipt.protectedApiHealthStatus}.`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) {
    throw new Error(failures.join(' | '));
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
