#!/usr/bin/env node

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

let chiefBase;
try {
  chiefBase = new URL(chiefBaseRaw);
} catch {
  fail('CHIEF_FEDERATED_RELAY_BASE_URL must be a valid URL.');
}
if (
  chiefBase.protocol !== 'https:'
  || chiefBase.username
  || chiefBase.password
  || chiefBase.search
  || chiefBase.hash
  || (chiefBase.pathname !== '/' && chiefBase.pathname !== '')
  || !IMMUTABLE_CHIEF_HOST.test(chiefBase.hostname)
) {
  fail('Chief runtime must be one exact immutable Chief workers.dev preview origin.');
}
if (!SHA40.test(chiefExpectedSha)) fail('Chief exact runtime SHA is required.');
if (!chiefExpectedBranch || /[\u0000\r\n]/u.test(chiefExpectedBranch)) fail('Chief exact branch identity is required.');
if (!accessClientId || !accessClientSecret) {
  fail('Both protected Chief Cloudflare Access client credentials are required.');
}

const chiefOrigin = chiefBase.origin;
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

const versionResponse = await globalThis.fetch(`${chiefOrigin}/version`, {
  headers: { Accept: 'application/json' },
  redirect: 'manual',
});
if (!versionResponse.ok) fail(`Chief protected /version returned HTTP ${versionResponse.status}.`);
const version = await versionResponse.json();
const observedSha = String(version?.sha || version?.gitSha || '').trim().toLowerCase();
const observedBranch = String(version?.branch || '').trim();
if (observedSha !== chiefExpectedSha) {
  fail(`Chief protected runtime SHA ${observedSha || 'missing'} does not match expected ${chiefExpectedSha}.`);
}
if (observedBranch !== chiefExpectedBranch) {
  fail(`Chief protected runtime branch ${observedBranch || 'missing'} does not match expected ${chiefExpectedBranch}.`);
}

await import('./prove-federated-agent-roundtrip-v31.mjs');
