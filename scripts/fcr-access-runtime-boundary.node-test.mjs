import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const browserProof = readFileSync('scripts/verify-fcr-front-door-playwright.mjs', 'utf8');
const pagesProxy = readFileSync('public/_worker.js', 'utf8');

test('browser witness proves the real Pages-to-Worker service-binding path', () => {
  assert.match(browserProof, /PUBLIC_HEALTH_URL = `\$\{PUBLIC_ORIGIN\}\/health`/);
  assert.match(browserProof, /EXPECTED_API_SERVICE = 'founder-control-room'/);
  assert.match(browserProof, /publicHealthReachesCanonicalWorker/);
  assert.match(browserProof, /x-founder-control-room-service/);
  assert.match(browserProof, /healthResponse\.ok\(\)/);
  assert.match(browserProof, /receipt\.publicHealthServiceIdentity === EXPECTED_API_SERVICE/);

  assert.match(pagesProxy, /env\.FCR_API\.fetch\(createApiRequest\(request\)\)/);
  assert.match(pagesProxy, /x-founder-control-room-service/);
  assert.match(pagesProxy, /EXPECTED_API_SERVICE = 'founder-control-room'/);
});

test('only api version is public while a different api route remains Access-protected', () => {
  assert.match(browserProof, /API_VERSION_URL = 'https:\/\/api\.foundercontrolroom\.org\/version'/);
  assert.match(browserProof, /PROTECTED_API_HEALTH_URL = 'https:\/\/api\.foundercontrolroom\.org\/health'/);
  assert.match(browserProof, /maxRedirects:\s*0/);
  assert.match(browserProof, /protectedApiHealthDeniedToStranger/);
  assert.match(browserProof, /\[401, 403\]\.includes/);
  assert.match(browserProof, /protectedApiHealthRedirectIsAccess/);
  assert.match(browserProof, /cloudflareaccess\\\.com/);
  assert.match(browserProof, /Protected API \/health unexpectedly became public/);
});

test('browser witness still proves exact-sha version and founder containment', () => {
  assert.match(browserProof, /versionPayload\.includes\(expectedHeadSha\)/);
  assert.match(browserProof, /founderAuthorityContained/);
  assert.match(browserProof, /receipt\.authMeStatus !== 401/);
  assert.match(browserProof, /\.sign-in-wrap/);
  assert.match(browserProof, /\.shell/);
});
