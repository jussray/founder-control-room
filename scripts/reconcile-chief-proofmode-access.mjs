import { mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://api.cloudflare.com/client/v4';
const POLICY_NAME = 'ProofMode CI service auth';
const DEFAULT_APP_NAME = 'chief-ai - Cloudflare Workers';
const IMMUTABLE_CHIEF_HOST = /^[0-9a-f]{8}-chief-ai\.mcgill-raylene\.workers\.dev$/i;
const REQUIRED_PATHS = ['/version', '/mcp'];
const RECEIPT_PATH = 'test-results/chief-proofmode-access-recovery.json';

function required(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function validateMode(mode) {
  if (mode !== 'check' && mode !== 'repair') {
    throw new Error('CHIEF_ACCESS_MODE must be check or repair.');
  }
  return mode;
}

function validateTargetUrl(raw) {
  const value = required(raw, 'CHIEF_ACCESS_TARGET_URL');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CHIEF_ACCESS_TARGET_URL must be a valid URL.');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
    || !IMMUTABLE_CHIEF_HOST.test(url.hostname)
  ) {
    throw new Error('CHIEF_ACCESS_TARGET_URL must be one immutable Chief workers.dev preview origin.');
  }
  return { origin: url.origin, hostname: url.hostname.toLowerCase() };
}

function unwrap(result, label) {
  if (!result || result.success !== true) {
    const code = result?.errors?.[0]?.code;
    throw new Error(`${label} failed${code ? ` (Cloudflare code ${code})` : ''}.`);
  }
  return result.result;
}

function hasSpecificServiceToken(policy, serviceTokenId) {
  return policy?.decision === 'non_identity'
    && Array.isArray(policy.include)
    && policy.include.some((rule) => rule?.service_token?.token_id === serviceTokenId);
}

function discoverBoundServiceTokenId(policies) {
  const ids = [...new Set(
    policies
      .filter((policy) => policy?.decision === 'non_identity' && Array.isArray(policy.include))
      .flatMap((policy) => policy.include)
      .map((rule) => (typeof rule?.service_token?.token_id === 'string' ? rule.service_token.token_id.trim() : ''))
      .filter(Boolean),
  )];
  if (ids.length === 0) {
    throw new Error('No existing non-identity service-token binding identifies the Chief CI token; configure an exact protected selector before repair.');
  }
  if (ids.length !== 1) {
    throw new Error(`Multiple service-token identities are bound to the effective Chief Access application; found ${ids.length}; refusing ambiguous discovery.`);
  }
  return ids[0];
}

async function cloudflareJson(fetchImpl, apiToken, path, init = {}) {
  const response = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Cloudflare API returned non-JSON HTTP ${response.status}.`);
  }

  if (!response.ok) {
    const code = payload?.errors?.[0]?.code;
    throw new Error(`Cloudflare API request failed with HTTP ${response.status}${code ? ` (code ${code})` : ''}.`);
  }
  return payload;
}

async function listAll(fetchImpl, apiToken, path, label) {
  const collected = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = await cloudflareJson(fetchImpl, apiToken, `${path}${separator}page=${page}&per_page=100`);
    const current = unwrap(payload, label);
    if (!Array.isArray(current)) throw new Error(`${label} returned an unexpected result shape.`);
    collected.push(...current);
    const totalPages = Number(payload?.result_info?.total_pages || 0);
    if (totalPages > 0) {
      if (page >= totalPages) return collected;
      continue;
    }
    if (current.length < 100) return collected;
  }
  throw new Error(`${label} exceeded the bounded pagination limit.`);
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function normalizePublicUri(raw) {
  let value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  value = value.replace(/^https?:\/\//, '');
  return value.replace(/^\/+/, '');
}

function publicUriMatchesChief(uri, hostname) {
  const pattern = normalizePublicUri(uri);
  if (!pattern) return false;
  const hostWidePattern = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
  if (!hostWidePattern.includes('/')) return globToRegExp(hostWidePattern).test(hostname);
  const matcher = globToRegExp(pattern);
  return REQUIRED_PATHS.some((path) => matcher.test(`${hostname}${path}`));
}

function isExactHostWidePublicUri(uri, hostname) {
  const pattern = normalizePublicUri(uri).replace(/\/+$/, '');
  return pattern === hostname || pattern === `${hostname}/*`;
}

function resolveEffectiveApplication(apps, hostname, applicationName) {
  const publicMatches = [];
  for (const app of apps) {
    for (const destination of app?.destinations || []) {
      if (destination?.type === 'public' && publicUriMatchesChief(destination.uri, hostname)) {
        publicMatches.push({ app, destination });
      }
    }
  }

  if (publicMatches.length) {
    const appIds = [...new Set(publicMatches.map(({ app }) => app?.id).filter(Boolean))];
    if (appIds.length !== 1) {
      throw new Error('Multiple public Access applications match the Chief preview paths; refusing ambiguous precedence.');
    }
    const selected = publicMatches[0].app;
    const destinations = Array.isArray(selected?.destinations) ? selected.destinations : [];
    const exactHostOnly = destinations.length === 1
      && destinations[0]?.type === 'public'
      && isExactHostWidePublicUri(destinations[0].uri, hostname);
    return {
      app: selected,
      scope: exactHostOnly ? 'public_exact_host' : 'public_path_or_multi_destination',
      repairEligible: exactHostOnly,
    };
  }

  const namedWorkerDestinations = [];
  for (const app of apps) {
    if (app?.name !== applicationName) continue;
    for (const destination of app?.destinations || []) {
      if ((destination?.type === 'worker' || destination?.type === 'preview_worker') && destination.worker_id) {
        namedWorkerDestinations.push({ app, destination });
      }
    }
  }

  const workerIds = [...new Set(namedWorkerDestinations.map(({ destination }) => destination.worker_id))];
  if (workerIds.length !== 1) {
    throw new Error(`Expected exactly one Chief Worker identity; found ${workerIds.length}.`);
  }
  const workerId = workerIds[0];
  const previewApps = apps.filter((app) => (app?.destinations || []).some(
    (destination) => destination?.type === 'preview_worker' && destination.worker_id === workerId,
  ));
  if (previewApps.length > 1) throw new Error('Multiple preview_worker Access applications protect Chief; refusing precedence guess.');
  if (previewApps.length === 1) return { app: previewApps[0], scope: 'preview_worker', repairEligible: false };

  const workerApps = apps.filter((app) => (app?.destinations || []).some(
    (destination) => destination?.type === 'worker' && destination.worker_id === workerId,
  ));
  if (workerApps.length > 1) throw new Error('Multiple worker Access applications protect Chief; refusing precedence guess.');
  if (workerApps.length === 1) return { app: workerApps[0], scope: 'worker', repairEligible: false };
  throw new Error('Could not resolve an effective Access application for the immutable Chief preview.');
}

function resolveServiceToken(serviceTokens, { serviceClientId, serviceTokenId, nowMs }) {
  const clientId = typeof serviceClientId === 'string' ? serviceClientId.trim() : '';
  const configuredId = typeof serviceTokenId === 'string' ? serviceTokenId.trim() : '';
  if (!clientId && !configuredId) throw new Error('Chief Access service-token identity is required.');

  let matches;
  if (configuredId) {
    matches = serviceTokens.filter((serviceToken) => serviceToken?.id === configuredId);
    if (matches.length !== 1) throw new Error(`Expected exactly one configured Cloudflare Access service token; found ${matches.length}.`);
    if (clientId && matches[0]?.client_id !== clientId) {
      throw new Error('Configured Chief service-token ID does not match the configured client ID.');
    }
  } else {
    matches = serviceTokens.filter((serviceToken) => serviceToken?.client_id === clientId);
    if (matches.length !== 1) throw new Error(`Expected exactly one Cloudflare Access service token for Chief client ID; found ${matches.length}.`);
  }

  const serviceToken = matches[0];
  const serviceId = required(serviceToken.id, 'Resolved Cloudflare service-token ID');
  if (serviceToken.enabled === false) throw new Error('The configured Chief Access service token is disabled.');
  if (serviceToken.expires_at) {
    const expiresAt = Date.parse(serviceToken.expires_at);
    if (!Number.isFinite(expiresAt)) throw new Error('The configured Chief Access service token has invalid expiry metadata.');
    if (expiresAt <= nowMs) throw new Error('The configured Chief Access service token is expired.');
  }
  return serviceId;
}

export async function ensureChiefProofModeAccessPolicy({
  fetchImpl = globalThis.fetch,
  mode,
  accountId,
  apiToken,
  targetUrl,
  serviceClientId,
  serviceTokenId,
  applicationName = DEFAULT_APP_NAME,
  nowMs = Date.now(),
}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const normalizedMode = validateMode(mode);
  const account = required(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const token = required(apiToken, normalizedMode === 'repair' ? 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN' : 'CLOUDFLARE_ACCESS_API_TOKEN');
  const appName = required(applicationName, 'CHIEF_ACCESS_APP_NAME');
  const target = validateTargetUrl(targetUrl);
  const configuredClientId = typeof serviceClientId === 'string' ? serviceClientId.trim() : '';
  const configuredServiceTokenId = typeof serviceTokenId === 'string' ? serviceTokenId.trim() : '';

  if (normalizedMode === 'repair' && !configuredClientId && !configuredServiceTokenId) {
    throw new Error('Chief Access service-token identity is required before repair.');
  }

  const apps = await listAll(fetchImpl, token, `/accounts/${encodeURIComponent(account)}/access/apps`, 'List Access applications');
  const effective = resolveEffectiveApplication(apps, target.hostname, appName);
  const appId = required(effective.app?.id, 'Resolved Cloudflare Access application ID');
  const policyPath = `/accounts/${encodeURIComponent(account)}/access/apps/${encodeURIComponent(appId)}/policies`;
  const policies = await listAll(fetchImpl, token, policyPath, 'List Access application policies');

  let identityTokenId = configuredServiceTokenId;
  if (normalizedMode === 'check' && !configuredClientId && !configuredServiceTokenId) {
    identityTokenId = discoverBoundServiceTokenId(policies);
  }

  const serviceTokens = await listAll(fetchImpl, token, `/accounts/${encodeURIComponent(account)}/access/service_tokens`, 'List Access service tokens');
  const serviceId = resolveServiceToken(serviceTokens, {
    serviceClientId: configuredClientId,
    serviceTokenId: identityTokenId,
    nowMs,
  });

  const exact = policies.find((policy) => hasSpecificServiceToken(policy, serviceId));
  if (exact) {
    return { state: 'configured', changed: false, appId, policyId: exact.id || null, scope: effective.scope, serviceTokenId: serviceId, targetOrigin: target.origin };
  }

  const conflictingNamedPolicy = policies.find((policy) => policy?.name === POLICY_NAME);
  if (conflictingNamedPolicy) {
    throw new Error('A ProofMode CI service-auth policy exists for another rule; refusing automatic overwrite.');
  }
  if (normalizedMode === 'check') {
    throw new Error(`No matching Chief Service Auth policy exists on effective scope ${effective.scope}.`);
  }
  if (!effective.repairEligible) {
    throw new Error(`Effective Access scope ${effective.scope} is not the approved exact immutable-preview host; refusing repair.`);
  }

  const created = unwrap(
    await cloudflareJson(fetchImpl, token, policyPath, {
      method: 'POST',
      body: JSON.stringify({
        name: POLICY_NAME,
        decision: 'non_identity',
        include: [{ service_token: { token_id: serviceId } }],
      }),
    }),
    'Create Access application policy',
  );
  if (!hasSpecificServiceToken(created, serviceId)) {
    throw new Error('Cloudflare created a policy that did not preserve the requested specific service-token rule.');
  }
  return { state: 'configured', changed: true, appId, policyId: created.id || null, scope: effective.scope, serviceTokenId: serviceId, targetOrigin: target.origin };
}

function writeReceipt(result, mode) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(RECEIPT_PATH, `${JSON.stringify({
    schemaVersion: 1,
    scope: 'chief-proofmode-access-recovery',
    observedAt: new Date().toISOString(),
    mode,
    state: result.state,
    mutationPerformed: result.changed,
    targetOrigin: result.targetOrigin,
    accessScope: result.scope,
    applicationId: result.appId,
    policyId: result.policyId,
    serviceTokenId: result.serviceTokenId,
  })}\n`, 'utf8');
}

async function main() {
  const mode = validateMode(process.env.CHIEF_ACCESS_MODE || 'check');
  const apiToken = mode === 'repair'
    ? process.env.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN
    : process.env.CLOUDFLARE_ACCESS_API_TOKEN;
  const result = await ensureChiefProofModeAccessPolicy({
    mode,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken,
    targetUrl: process.env.CHIEF_ACCESS_TARGET_URL,
    serviceClientId: process.env.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID,
    serviceTokenId: process.env.CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID,
    applicationName: process.env.CHIEF_ACCESS_APP_NAME || DEFAULT_APP_NAME,
  });
  writeReceipt(result, mode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
