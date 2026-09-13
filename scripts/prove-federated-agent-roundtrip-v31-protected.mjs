#!/usr/bin/env node

const fcrBaseRaw = String(process.env.FCR_FEDERATED_RELAY_BASE_URL || '').trim();
const fcrExpectedSha = String(process.env.FCR_FEDERATED_RELAY_SOURCE_SHA || '').trim().toLowerCase();
const fcrExpectedBranch = String(process.env.FCR_FEDERATED_RELAY_SOURCE_BRANCH || '').trim();
const chiefBaseRaw = String(process.env.CHIEF_FEDERATED_RELAY_BASE_URL || '').trim();
const chiefExpectedSha = String(process.env.CHIEF_FEDERATED_RELAY_TARGET_SHA || '').trim().toLowerCase();
const chiefExpectedBranch = String(process.env.CHIEF_FEDERATED_RELAY_TARGET_BRANCH || '').trim();
const accessClientId = String(process.env.CHIEF_RUNTIME_ACCESS_CLIENT_ID || '').trim();
const accessClientSecret = String(process.env.CHIEF_RUNTIME_ACCESS_CLIENT_SECRET || '').trim();
const SHA40 = /^[0-9a-f]{40}$/;
const IMMUTABLE_CHIEF_HOST = /^[0-9a-f]{8}-chief-ai\.mcgill-raylene\.workers\.dev$/i;

function fail(message) {
  throw new Error(`Protected federated relay v3.1 proof failed: ${message}`);
}

function exactHttpsOrigin(raw, label) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${label} must be a valid URL.`);
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
  ) {
    fail(`${label} must be one HTTPS origin with no credentials, path, query, or fragment.`);
  }
  return url;
}

const fcrBase = exactHttpsOrigin(fcrBaseRaw, 'FCR exact candidate runtime');
const chiefBase = exactHttpsOrigin(chiefBaseRaw, 'Chief exact candidate runtime');
if (fcrBase.hostname === 'api.foundercontrolroom.org') {
  fail('FCR production is not an acceptable pre-merge proof subject; supply an exact candidate runtime origin.');
}
if (!IMMUTABLE_CHIEF_HOST.test(chiefBase.hostname)) {
  fail('Chief runtime must be one exact immutable Chief workers.dev preview origin.');
}
if (!SHA40.test(fcrExpectedSha) || !SHA40.test(chiefExpectedSha)) {
  fail('Both FCR and Chief exact runtime SHAs are required.');
}
if (!fcrExpectedBranch || /[\u0000\r\n]/u.test(fcrExpectedBranch)) {
  fail('FCR exact branch identity is required.');
}
if (!chiefExpectedBranch || /[\u0000\r\n]/u.test(chiefExpectedBranch)) {
  fail('Chief exact branch identity is required.');
}
if (!accessClientId || !accessClientSecret) {
  fail('Both protected Chief Cloudflare Access client credentials are required.');
}

const fcrOrigin = fcrBase.origin;
const chiefOrigin = chiefBase.origin;
if (fcrOrigin === chiefOrigin) fail('FCR and Chief proof origins must be distinct.');

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = {}) => {
  const raw = input instanceof URL
    ? input.href
    : typeof input === 'string'
      ? input
      : input?.url;
  const target = new URL(raw);
  if (target.origin !== chiefOrigin) return nativeFetch(input, init);

  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  const overrides = new Headers(init.headers || undefined);
  overrides.forEach((value, key) => headers.set(key, value));
  headers.set('CF-Access-Client-Id', accessClientId);
  headers.set('CF-Access-Client-Secret', accessClientSecret);
  return nativeFetch(input, { ...init, headers });
};

const [fcrVersionResponse, chiefVersionResponse] = await Promise.all([
  globalThis.fetch(`${fcrOrigin}/version`, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  }),
  globalThis.fetch(`${chiefOrigin}/version`, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  }),
]);
if (!fcrVersionResponse.ok) fail(`FCR exact candidate /version returned HTTP ${fcrVersionResponse.status}.`);
if (!chiefVersionResponse.ok) fail(`Chief protected /version returned HTTP ${chiefVersionResponse.status}.`);

const [fcrVersion, chiefVersion] = await Promise.all([
  fcrVersionResponse.json(),
  chiefVersionResponse.json(),
]);
const observedFcrSha = String(fcrVersion?.sha || fcrVersion?.gitSha || '').trim().toLowerCase();
const observedChiefSha = String(chiefVersion?.sha || chiefVersion?.gitSha || '').trim().toLowerCase();
const observedChiefBranch = String(chiefVersion?.branch || '').trim();
if (observedFcrSha !== fcrExpectedSha) {
  fail(`FCR candidate runtime SHA ${observedFcrSha || 'missing'} does not match expected ${fcrExpectedSha}.`);
}
if (observedChiefSha !== chiefExpectedSha) {
  fail(`Chief protected runtime SHA ${observedChiefSha || 'missing'} does not match expected ${chiefExpectedSha}.`);
}
if (observedChiefBranch !== chiefExpectedBranch) {
  fail(`Chief protected runtime branch ${observedChiefBranch || 'missing'} does not match expected ${chiefExpectedBranch}.`);
}

await import('./prove-federated-agent-roundtrip-v31.mjs');
