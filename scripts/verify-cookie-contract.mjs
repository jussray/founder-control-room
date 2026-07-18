import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const registry = await readJson('config/portfolio-cookie-registry.json');
const founder = await readJson('.control-room/cookie-policy.json');
const sessionSource = await readText('src/auth/founderSession.ts');
const guardSource = await readText('src/http/middleware/cookieSecurity.ts');
const serverSource = await readText('src/http/server.ts');
const errors = [];

const requireValue = (condition, message) => {
  if (!condition) errors.push(message);
};

requireValue(registry.schemaVersion === 1, 'registry schemaVersion must be 1');
requireValue(registry.repositories?.length === 7, 'registry must cover exactly seven active repositories');
requireValue(
  new Set(registry.repositories.map((entry) => entry.repository)).size === 7,
  'registry repository identifiers must be unique',
);
requireValue(registry.rules?.nonessentialCookiesEnabled === false, 'nonessential cookies must remain disabled');
requireValue(registry.rules?.trackingCookiesAllowed === false, 'tracking cookies must remain forbidden');
requireValue(registry.rules?.consentCookieRequired === false, 'do not create consent-cookie theater without nonessential cookies');

requireValue(founder.repository === 'jussray/founder-control-room', 'founder manifest repository mismatch');
requireValue(founder.firstPartyCookies?.length === 2, 'founder manifest must contain production and localhost names only');
for (const cookie of founder.firstPartyCookies ?? []) {
  requireValue(cookie.classification === 'strictly_necessary', `${cookie.name}: classification must be strictly_necessary`);
  requireValue(cookie.httpOnly === true, `${cookie.name}: HttpOnly is required`);
  requireValue(cookie.secureInProduction === true, `${cookie.name}: Secure in production is required`);
  requireValue(cookie.sameSite === 'Lax', `${cookie.name}: SameSite must remain Lax`);
  requireValue(cookie.path === '/', `${cookie.name}: Path must remain /`);
  requireValue(cookie.maxAgeSeconds <= 30 * 24 * 60 * 60, `${cookie.name}: maximum age exceeds 30 days`);
}

for (const fragment of [
  "'__Host-fcr_session'",
  "'fcr_session'",
  'HttpOnly',
  'SameSite=Lax',
  "'Cache-Control', 'private, no-store'",
  "'Pragma', 'no-cache'",
]) {
  requireValue(sessionSource.includes(fragment), `founder session source missing ${fragment}`);
}
for (const fragment of [
  'hasFounderSessionCookie',
  "fetchSite === 'cross-site'",
  'origin !== expectedOrigin',
]) {
  requireValue(guardSource.includes(fragment), `cookie mutation guard missing ${fragment}`);
}
requireValue(
  serverSource.includes('app.use(requireSameOriginForCookieMutation)'),
  'server must mount the cookie mutation guard',
);

const combined = JSON.stringify({ registry, founder }).toLowerCase();
for (const forbidden of ['advertising_cookie', 'tracking_cookie', 'fingerprint_cookie']) {
  requireValue(!combined.includes(forbidden), `forbidden cookie category present: ${forbidden}`);
}

if (errors.length > 0) {
  console.error('Portfolio cookie contract verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Portfolio cookie contract verified.');
console.log(`Repositories covered: ${registry.repositories.length}`);
console.log(`Custom production session cookies: ${founder.firstPartyCookies.filter((cookie) => cookie.environments.includes('production')).length}`);
console.log('Tracking cookies: 0');
