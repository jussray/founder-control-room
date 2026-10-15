import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const RECEIPT_PATH = 'test-results/fcr-cloudflare-access-boundary-provider.json';
const BOUNDARY_PATH = new URL('../config/fcr-cloudflare-access-boundary.json', import.meta.url);

export const FCR_ACCESS_ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';
export const FCR_API_WORKER_ID = 'founder-control-room';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function required(value, label) {
  const normalized = clean(value);
  if (!normalized) throw Object.assign(new Error(`${label} is required.`), { classification: 'required-input-missing' });
  return normalized;
}

function destinationType(destination) {
  return clean(destination?.type).toLowerCase();
}

function normalizePublicUri(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function publicHost(value) {
  return normalizePublicUri(value).split('/')[0];
}

function publicDestinations(application) {
  return (Array.isArray(application?.destinations) ? application.destinations : [])
    .filter((destination) => destinationType(destination) === 'public');
}

function isEveryoneBypassPolicy(policy) {
  if (clean(policy?.decision).toLowerCase() !== 'bypass') return false;
  const include = Array.isArray(policy?.include) ? policy.include : [];
  const requireRules = Array.isArray(policy?.require) ? policy.require : [];
  const exclude = Array.isArray(policy?.exclude) ? policy.exclude : [];
  if (requireRules.length > 0 || exclude.length > 0) return false;
  return include.some((rule) => rule && typeof rule === 'object' && rule.everyone && typeof rule.everyone === 'object');
}

function isIdentityAllowPolicy(policy) {
  return clean(policy?.decision).toLowerCase() === 'allow'
    && Array.isArray(policy?.include)
    && policy.include.length > 0;
}

function serviceTokenIds(policies) {
  return [...new Set(
    policies
      .filter((policy) => clean(policy?.decision).toLowerCase() === 'non_identity')
      .flatMap((policy) => Array.isArray(policy?.include) ? policy.include : [])
      .map((rule) => clean(rule?.service_token?.token_id))
      .filter(Boolean),
  )];
}

async function cloudflareJson(fetchImpl, apiToken, method, path) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw Object.assign(new Error(`Cloudflare ${method} ${path} returned non-JSON HTTP ${response.status}.`), {
      classification: 'provider-read-failed',
    });
  }
  if (!response.ok || payload?.success === false) {
    throw Object.assign(new Error(`Cloudflare ${method} ${path} failed with HTTP ${response.status}.`), {
      classification: 'provider-read-failed',
      providerStatus: response.status,
    });
  }
  return payload?.result ?? null;
}

async function listApplications(args) {
  const result = await cloudflareJson(args.fetchImpl, args.apiToken, 'GET', `/accounts/${args.accountId}/access/apps?per_page=1000`);
  return Array.isArray(result) ? result : [];
}

async function listPolicies(args, appId) {
  const result = await cloudflareJson(
    args.fetchImpl,
    args.apiToken,
    'GET',
    `/accounts/${args.accountId}/access/apps/${encodeURIComponent(appId)}/policies?per_page=1000`,
  );
  return Array.isArray(result) ? result : [];
}

async function listServiceTokens(args) {
  const result = await cloudflareJson(args.fetchImpl, args.apiToken, 'GET', `/accounts/${args.accountId}/access/service_tokens?per_page=1000`);
  return Array.isArray(result) ? result : [];
}

function applicationHasHost(application, hostname) {
  return publicDestinations(application).some((destination) => publicHost(destination?.uri || destination?.hostname) === hostname);
}

function applicationOwnsUri(application, normalizedUri) {
  return publicDestinations(application).some(
    (destination) => normalizePublicUri(destination?.uri || destination?.hostname) === normalizedUri,
  );
}

function workerDestinationMatches(destination) {
  if (destinationType(destination) !== 'worker') return false;
  const worker = clean(destination?.worker_id || destination?.uri).toLowerCase();
  return worker === FCR_API_WORKER_ID;
}

function workerApplications(applications) {
  return applications.filter((application) =>
    (Array.isArray(application?.destinations) ? application.destinations : []).some(workerDestinationMatches));
}

function resolveServiceToken(serviceTokens, { clientId, tokenId, nowMs }) {
  const configuredClientId = clean(clientId);
  const configuredTokenId = clean(tokenId);
  if (!configuredClientId && !configuredTokenId) {
    throw Object.assign(new Error('FCR Access service-token identity selector is required.'), {
      classification: 'service-token-selector-missing',
    });
  }

  let matches;
  if (configuredTokenId) {
    matches = serviceTokens.filter((token) => clean(token?.id) === configuredTokenId);
    if (matches.length !== 1) {
      throw Object.assign(new Error(`Expected exactly one configured FCR Access service token; found ${matches.length}.`), {
        classification: 'service-token-invalid-or-ambiguous',
      });
    }
    if (configuredClientId && clean(matches[0]?.client_id) !== configuredClientId) {
      throw Object.assign(new Error('Configured FCR Access service-token ID does not match the protected client ID.'), {
        classification: 'service-token-invalid-or-ambiguous',
      });
    }
  } else {
    matches = serviceTokens.filter((token) => clean(token?.client_id) === configuredClientId);
    if (matches.length !== 1) {
      throw Object.assign(new Error(`Expected exactly one FCR Access service token for protected client ID; found ${matches.length}.`), {
        classification: 'service-token-invalid-or-ambiguous',
      });
    }
  }

  const token = matches[0];
  if (token?.enabled === false) {
    throw Object.assign(new Error('The configured FCR Access service token is disabled.'), {
      classification: 'service-token-invalid-or-ambiguous',
    });
  }
  if (token?.expires_at) {
    const expiresAt = Date.parse(token.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
      throw Object.assign(new Error('The configured FCR Access service token is expired or has invalid expiry metadata.'), {
        classification: 'service-token-invalid-or-ambiguous',
      });
    }
  }
  return required(token?.id, 'Resolved FCR Access service-token ID');
}

function fail(message, classification, details = {}) {
  throw Object.assign(new Error(message), { classification, ...details });
}

export async function verifyFcrCloudflareAccessBoundary({
  fetchImpl = globalThis.fetch,
  env = process.env,
  nowMs = Date.now(),
  boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8')),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.', 'fetch-missing');
  const accountId = clean(env.CLOUDFLARE_ACCOUNT_ID) || FCR_ACCESS_ACCOUNT_ID;
  if (accountId !== FCR_ACCESS_ACCOUNT_ID) {
    fail('FCR Access boundary verification is pinned to the canonical Cloudflare account.', 'account-authority-mismatch');
  }
  const apiToken = required(env.CLOUDFLARE_ACCESS_API_TOKEN, 'CLOUDFLARE_ACCESS_API_TOKEN');
  const expectedPublicHosts = new Set(boundary.publicHosts);
  const expectedAccessHosts = new Set(boundary.accessRequiredHosts);
  if (!expectedPublicHosts.has('foundercontrolroom.org') || !expectedPublicHosts.has('www.foundercontrolroom.org')) {
    fail('Boundary config must keep apex and www public.', 'boundary-config-invalid');
  }
  if (!expectedAccessHosts.has('app.foundercontrolroom.org') || !expectedAccessHosts.has('api.foundercontrolroom.org')) {
    fail('Boundary config must require Access for app and api.', 'boundary-config-invalid');
  }
  if (boundary.apiDefault !== 'access_required') fail('API default must remain access_required.', 'boundary-config-invalid');

  const args = { fetchImpl, apiToken, accountId };
  const applications = await listApplications(args);

  const publicDoorwayApps = applications.filter((application) =>
    [...expectedPublicHosts].some((host) => applicationHasHost(application, host)));
  if (publicDoorwayApps.length > 0) {
    fail('Cloudflare Access still owns a public doorway destination.', 'public-doorway-access-present', {
      count: publicDoorwayApps.length,
    });
  }

  const appHostApps = applications.filter((application) => applicationHasHost(application, 'app.foundercontrolroom.org'));
  if (appHostApps.length !== 1) {
    fail(`Expected exactly one Access application for app.foundercontrolroom.org; found ${appHostApps.length}.`, 'app-access-application-missing-or-ambiguous');
  }
  const appHostId = required(appHostApps[0]?.id, 'App Access application ID');
  const appPolicies = await listPolicies(args, appHostId);
  if (appPolicies.some(isEveryoneBypassPolicy) || !appPolicies.some(isIdentityAllowPolicy)) {
    fail('app.foundercontrolroom.org must have identity allow policy and no Everyone bypass.', 'app-access-policy-invalid');
  }

  const workers = workerApplications(applications);
  if (workers.length !== 1) {
    fail(`Expected exactly one Access application protecting Worker ${FCR_API_WORKER_ID}; found ${workers.length}.`, 'api-worker-access-application-missing-or-ambiguous');
  }
  const workerId = required(workers[0]?.id, 'API Worker Access application ID');
  const workerPolicies = await listPolicies(args, workerId);
  const serviceTokens = await listServiceTokens(args);
  const serviceTokenId = resolveServiceToken(serviceTokens, {
    clientId: env.FCR_CLOUDFLARE_ACCESS_CLIENT_ID,
    tokenId: env.FCR_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID,
    nowMs,
  });
  if (!serviceTokenIds(workerPolicies).includes(serviceTokenId)) {
    fail('The API Worker Access application does not bind the configured FCR service token.', 'api-service-auth-policy-missing');
  }

  const expectedUris = new Set(
    boundary.applicationAuthenticatedBypassPaths.map((path) =>
      normalizePublicUri(`api.foundercontrolroom.org${path}`)),
  );
  const apiPublicDestinations = [];
  for (const application of applications) {
    for (const destination of publicDestinations(application)) {
      const uri = normalizePublicUri(destination?.uri || destination?.hostname);
      if (publicHost(uri) === 'api.foundercontrolroom.org') {
        apiPublicDestinations.push({ application, uri });
      }
    }
  }

  const unexpected = apiPublicDestinations.filter(({ uri }) => !expectedUris.has(uri));
  if (unexpected.length > 0) {
    fail('Cloudflare Access exposes undeclared API bypass destinations.', 'unexpected-api-bypass-destination', {
      count: unexpected.length,
    });
  }

  const policiesByApp = new Map();
  const covered = [];
  for (const expectedUri of expectedUris) {
    const owners = apiPublicDestinations.filter(({ uri }) => uri === expectedUri);
    if (owners.length !== 1) {
      fail(`Expected exactly one API bypass owner for ${expectedUri}; found ${owners.length}.`, 'api-exception-coverage-missing-or-ambiguous');
    }
    const appId = required(owners[0].application?.id, 'API bypass application ID');
    if (!policiesByApp.has(appId)) policiesByApp.set(appId, await listPolicies(args, appId));
    if (!policiesByApp.get(appId).some(isEveryoneBypassPolicy)) {
      fail(`API exception ${expectedUri} is not backed by an exact Everyone bypass policy.`, 'api-exception-policy-invalid');
    }
    covered.push(expectedUri);
  }

  return {
    schemaVersion: 1,
    scope: 'fcr-cloudflare-access-boundary-provider',
    observedAt: new Date().toISOString(),
    expectedHeadSha: clean(env.EXPECTED_HEAD_SHA || env.GITHUB_SHA) || null,
    state: 'ready',
    publicDoorwayClear: true,
    appHostProtected: true,
    apiWorkerProtected: true,
    apiServiceAuthVerified: true,
    serviceTokenIdFingerprint: fingerprint(serviceTokenId),
    expectedExceptionCount: expectedUris.size,
    verifiedExceptionCount: covered.length,
    unexpectedApiBypassCount: 0,
  };
}

function writeReceipt(receipt) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt)}\n`, 'utf8');
}

function blockedReceipt(error) {
  return {
    schemaVersion: 1,
    scope: 'fcr-cloudflare-access-boundary-provider',
    observedAt: new Date().toISOString(),
    expectedHeadSha: clean(process.env.EXPECTED_HEAD_SHA || process.env.GITHUB_SHA) || null,
    state: 'blocked',
    classification: clean(error?.classification) || 'bounded-check-failed',
    publicDoorwayClear: false,
    appHostProtected: false,
    apiWorkerProtected: false,
    apiServiceAuthVerified: false,
    serviceTokenIdFingerprint: null,
    expectedExceptionCount: null,
    verifiedExceptionCount: null,
    unexpectedApiBypassCount: null,
  };
}

async function main() {
  const receipt = await verifyFcrCloudflareAccessBoundary();
  writeReceipt(receipt);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    writeReceipt(blockedReceipt(error));
    process.exitCode = 1;
  });
}
