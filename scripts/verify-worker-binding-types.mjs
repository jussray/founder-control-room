#!/usr/bin/env node
/**
 * Cloudflare Worker credential binding preflight.
 * Checks only names and types; never logs binding values.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const WORKER = 'founder-control-room';

// Only source-authored fixed error codes can reach CI logs, never provider text.
export function safePreflightError(error) {
  if (!(error instanceof Error)) return 'provider-preflight-failed';
  const code = error.message;
  if (/^(?:missing-cloudflare-preflight-credential|invalid-worker-account-config|worker-account-mismatch|provider-settings-not-verified|malformed-provider-bindings|duplicate-provider-binding-names|credential-binding-not-secret|provider-request-failed|provider-response-invalid)$/.test(code)) {
    return code;
  }
  if (/^provider-settings-http-[1-5][0-9]{2}$/.test(code)) return code;
  return 'provider-preflight-failed';
}
const CREDENTIAL_WORDS = new Set(['TOKEN', 'SECRET', 'PASSWORD', 'PASSWD', 'KEY', 'CREDENTIAL', 'HMAC', 'PEM', 'SEED', 'APIKEY']);
export function isCredentialBindingName(name) {
  const parts = String(name)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map(part => part.toUpperCase());
  return parts.some(part =>
    CREDENTIAL_WORDS.has(part) || (part.endsWith('S') && CREDENTIAL_WORDS.has(part.slice(0, -1))),
  );
}

export function validateBindingTypes(payload, { allowStaleCfApiTokenRemoval = false } = {}) {
  const bindings = payload?.result?.bindings;
  if (payload?.success !== true || !Array.isArray(bindings)) {
    return { ok: false, reason: 'provider-settings-not-verified', unsafe: [] };
  }
  if (bindings.some(b => !b || typeof b.name !== 'string' || typeof b.type !== 'string')) {
    return { ok: false, reason: 'malformed-provider-bindings', unsafe: [] };
  }
  const seen = new Set();
  const unsafe = [];
  for (const { name, type } of bindings) {
    if (seen.has(name)) return { ok: false, reason: 'duplicate-provider-binding-names', unsafe: [] };
    seen.add(name);
    if (isCredentialBindingName(name) && type !== 'secret_text' && type !== 'secrets_store_secret') {
      unsafe.push({ name, type });
    }
  }
  const repairableStaleCfApiToken =
    allowStaleCfApiTokenRemoval &&
    unsafe.length === 1 &&
    unsafe[0].name === 'CF_API_TOKEN' &&
    unsafe[0].type === 'plain_text';
  return {
    ok: unsafe.length === 0 || repairableStaleCfApiToken,
    reason: unsafe.length === 0
      ? 'verified-name-type-only'
      : repairableStaleCfApiToken
        ? 'repairable-stale-cf-api-token-plaintext'
        : 'credential-binding-not-secret',
    unsafe,
    repairableStaleCfApiToken,
  };
}

function checkedInAccountId(env) {
  const config = readFileSync('wrangler.worker.toml', 'utf8');
  const match = config.match(/^account_id\s*=\s*"([0-9a-f]{32})"\s*$/m);
  if (!match) throw new Error('invalid-worker-account-config');
  const actual = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (actual && actual !== match[1]) throw new Error('worker-account-mismatch');
  return match[1];
}

export async function runProviderPreflight({ fetchFn = fetch, env = process.env } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('missing-cloudflare-preflight-credential');
  const account = checkedInAccountId(env);
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + account +
    '/workers/scripts/' + WORKER + '/settings';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let response;
    try {
      response = await fetchFn(url, {
        method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        signal: controller.signal, redirect: 'error',
      });
    } catch {
      throw new Error('provider-request-failed');
    }
    if (!response.ok) {
      const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? response.status : 'unknown';
      throw new Error('provider-settings-http-' + status);
    }
    // Provider response and parser exceptions may contain plaintext values. Never print or persist either.
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('provider-response-invalid');
    }
    const result = validateBindingTypes(payload, {
      allowStaleCfApiTokenRemoval: env.FCR_ALLOW_STALE_CF_API_TOKEN_REMOVAL === 'true',
    });
    if (!result.ok) throw new Error(result.reason);
    // Fingerprint only sorted binding names and types, never credential contents.
    const metadata = payload.result.bindings
      .map(({ name, type }) => ({ name, type }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const bindingFingerprint = 'sha256:' + createHash('sha256')
      .update(JSON.stringify({ worker: WORKER, metadata }))
      .digest('hex');
    return { ok: true, worker: WORKER, bindingCount: metadata.length, bindingFingerprint, repairableStaleCfApiToken: result.repairableStaleCfApiToken === true };
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runProviderPreflight().then(result => {
    console.log('WORKER_BINDING_SECURITY_PASS worker=' + result.worker +
      ' checked=' + result.bindingCount + ' fingerprint=' + result.bindingFingerprint +
      ' repair=' + (result.repairableStaleCfApiToken ? 'stale-cf-api-token-plaintext' : 'none') +
      ' values=redacted');
  }).catch(error => {
    console.error('WORKER_BINDING_SECURITY_BLOCKED ' +
      safePreflightError(error));
    process.exitCode = 1;
  });
}
