import { mkdirSync, writeFileSync } from 'node:fs';
import { ensureChiefProofModeAccessPolicy } from './reconcile-chief-proofmode-access.mjs';

const SUCCESS_RECEIPT_PATH = 'test-results/chief-proofmode-access-recovery.json';
const FAILURE_RECEIPT_PATH = 'test-results/chief-proofmode-access-failure.json';
const IMMUTABLE_CHIEF_HOST = /^[0-9a-f]{8}-chief-ai\.mcgill-raylene\.workers\.dev$/i;

export const CHIEF_ACCESS_FAILURE_CLASSIFICATIONS = Object.freeze([
  'missing_read_credential',
  'provider_read_failed',
  'provider_read_shape_invalid',
  'ambiguous_application',
  'no_bound_service_token',
  'ambiguous_bound_service_token',
  'configured_service_token_mismatch',
  'service_token_disabled',
  'service_token_expired_or_invalid',
  'policy_conflict',
  'policy_missing',
  'provider_check_failed',
]);

export function classifyChiefAccessFailure(error) {
  const message = error instanceof Error ? error.message : '';
  if (/CLOUDFLARE_ACCESS_API_TOKEN is required/i.test(message)) return 'missing_read_credential';
  if (/non-JSON|unexpected result shape|bounded pagination limit/i.test(message)) return 'provider_read_shape_invalid';
  if (/Cloudflare API request failed|List Access .* failed/i.test(message)) return 'provider_read_failed';
  if (/Multiple public Access applications|Multiple preview_worker Access applications|Multiple worker Access applications|Expected exactly one Chief Worker identity|Could not resolve an effective Access application/i.test(message)) return 'ambiguous_application';
  if (/No existing non-identity service-token binding/i.test(message)) return 'no_bound_service_token';
  if (/Multiple service-token identities/i.test(message)) return 'ambiguous_bound_service_token';
  if (/configured client ID|Expected exactly one configured Cloudflare Access service token|Expected exactly one Cloudflare Access service token for Chief client ID/i.test(message)) return 'configured_service_token_mismatch';
  if (/service token is disabled/i.test(message)) return 'service_token_disabled';
  if (/service token is expired|invalid expiry metadata/i.test(message)) return 'service_token_expired_or_invalid';
  if (/service-auth policy exists for another rule/i.test(message)) return 'policy_conflict';
  if (/No matching Chief Service Auth policy/i.test(message)) return 'policy_missing';
  return 'provider_check_failed';
}

export function normalizeSafeChiefTarget(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '/' && url.pathname !== '')
      || !IMMUTABLE_CHIEF_HOST.test(url.hostname)
    ) return 'UNKNOWN';
    return url.origin;
  } catch {
    return 'UNKNOWN';
  }
}

export function buildChiefAccessFailureReceipt({ error, targetUrl, observedAt = new Date().toISOString() }) {
  return {
    schemaVersion: 1,
    scope: 'chief-proofmode-access-recovery',
    observedAt,
    mode: 'check',
    state: 'blocked',
    mutationPerformed: false,
    targetOrigin: normalizeSafeChiefTarget(targetUrl),
    classification: classifyChiefAccessFailure(error),
  };
}

function writeJson(path, value) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
}

function writeSuccessReceipt(result) {
  writeJson(SUCCESS_RECEIPT_PATH, {
    schemaVersion: 1,
    scope: 'chief-proofmode-access-recovery',
    observedAt: new Date().toISOString(),
    mode: 'check',
    state: result.state,
    mutationPerformed: result.changed,
    targetOrigin: result.targetOrigin,
    accessScope: result.scope,
    applicationId: result.appId,
    policyId: result.policyId,
    serviceTokenId: result.serviceTokenId,
  });
}

export async function runChiefAccessCheck({ env = process.env, ensure = ensureChiefProofModeAccessPolicy } = {}) {
  if ((env.CHIEF_ACCESS_MODE || 'check') !== 'check') {
    throw new Error('The bounded Chief Access diagnostic runner is check-only.');
  }
  const result = await ensure({
    mode: 'check',
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_ACCESS_API_TOKEN,
    targetUrl: env.CHIEF_ACCESS_TARGET_URL,
    serviceClientId: env.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID,
    serviceTokenId: env.CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID,
    applicationName: env.CHIEF_ACCESS_APP_NAME,
  });
  writeSuccessReceipt(result);
  return result;
}

async function main() {
  try {
    await runChiefAccessCheck();
  } catch (error) {
    writeJson(FAILURE_RECEIPT_PATH, buildChiefAccessFailureReceipt({
      error,
      targetUrl: process.env.CHIEF_ACCESS_TARGET_URL,
    }));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
