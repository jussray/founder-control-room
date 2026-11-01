#!/usr/bin/env node
/**
 * Cloudflare Worker credential binding preflight.
 * Checks only names and types; never logs binding values.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const WORKER = 'founder-control-room';
const CREDENTIAL_BINDING = /(?:^|_)(?:API_?TOKEN|ACCESS_?TOKEN|SECRET|PASSWORD|PRIVATE_?KEY|SERVICE_ROLE_KEY|ENCRYPTION_KEY|WEBHOOK_?TOKEN|BEARER_?TOKEN|AUTH_?TOKEN|KEY)$/i;

export function validateBindingTypes(payload) {
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
    const normalizedName = name.replace(/_(?:PEM|BASE64|B64)$/i, '');
    if (CREDENTIAL_BINDING.test(normalizedName) && type !== 'secret_text' && type !== 'secrets_store_secret') {
      unsafe.push({ name, type });
    }
  }
  return { ok: unsafe.length === 0, reason: unsafe.length ? 'credential-binding-not-secret' : 'verified-name-type-only', unsafe };
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
    const response = await fetchFn(url, {
      method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) throw new Error('provider-settings-http-' + response.status);
    // The response might contain plaintext values. Never print or persist it.
    const payload = await response.json();
    const result = validateBindingTypes(payload);
    if (!result.ok) throw new Error(result.reason + ': ' +
      result.unsafe.map(b => b.name + '(' + b.type + ')').join(', '));
    // Fingerprint only sorted binding names and types, never credential contents.
    const metadata = payload.result.bindings
      .map(({ name, type }) => ({ name, type }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const bindingFingerprint = 'sha256:' + createHash('sha256')
      .update(JSON.stringify({ worker: WORKER, metadata }))
      .digest('hex');
    return { ok: true, worker: WORKER, bindingCount: metadata.length, bindingFingerprint };
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runProviderPreflight().then(result => {
    console.log('WORKER_BINDING_SECURITY_PASS worker=' + result.worker +
      ' checked=' + result.bindingCount + ' fingerprint=' + result.bindingFingerprint + ' values=redacted');
  }).catch(error => {
    console.error('WORKER_BINDING_SECURITY_BLOCKED ' +
      (error instanceof Error ? error.message : 'unknown'));
    process.exitCode = 1;
  });
}
