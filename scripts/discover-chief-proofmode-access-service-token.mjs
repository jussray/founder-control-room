import { appendFileSync } from 'node:fs';

const API = 'https://api.cloudflare.com/client/v4';
const DEFAULT_APP_NAME = 'chief-ai - Cloudflare Workers';
const IMMUTABLE_CHIEF_HOST = /^[0-9a-f]{8}-chief-ai\.mcgill-raylene\.workers\.dev$/i;

function required(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
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

function unwrap(payload, label) {
  if (!payload || payload.success !== true) {
    const code = payload?.errors?.[0]?.code;
    throw new Error(`${label} failed${code ? ` (Cloudflare code ${code})` : ''}.`);
  }
  return payload.result;
}

async function cloudflareJson(fetchImpl, apiToken, path) {
  const response = await fetchImpl(`${API}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
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

function normalizePublicUri(raw) {
  let value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  value = value.replace(/^https?:\/\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return value;
}

function isExactTargetPublicDestination(destination, hostname) {
  if (destination?.type !== 'public') return false;
  const uri = normalizePublicUri(destination.uri);
  return uri === hostname || uri === `${hostname}/*`;
}

function appTargetsWorker(app, workerId) {
  return (app?.destinations || []).some(
    (destination) => (destination?.type === 'worker' || destination?.type === 'preview_worker')
      && destination.worker_id === workerId,
  );
}

function collectBoundServiceTokenIds(policies) {
  return [...new Set(
    policies
      .filter((policy) => policy?.decision === 'non_identity' && Array.isArray(policy.include))
      .flatMap((policy) => policy.include)
      .map((rule) => (typeof rule?.service_token?.token_id === 'string' ? rule.service_token.token_id.trim() : ''))
      .filter(Boolean),
  )];
}

function assertActiveServiceToken(serviceTokens, serviceTokenId, nowMs) {
  const matches = serviceTokens.filter((token) => token?.id === serviceTokenId);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Cloudflare Access service token for the discovered Chief binding; found ${matches.length}.`);
  }
  const token = matches[0];
  if (token.enabled === false) throw new Error('The discovered Chief Access service token is disabled.');
  if (token.expires_at) {
    const expiresAt = Date.parse(token.expires_at);
    if (!Number.isFinite(expiresAt)) throw new Error('The discovered Chief Access service token has invalid expiry metadata.');
    if (expiresAt <= nowMs) throw new Error('The discovered Chief Access service token is expired.');
  }
}

export async function discoverChiefProofModeServiceTokenId({
  fetchImpl = globalThis.fetch,
  accountId,
  apiToken,
  targetUrl,
  applicationName = DEFAULT_APP_NAME,
  nowMs = Date.now(),
}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const account = required(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const token = required(apiToken, 'CLOUDFLARE_ACCESS_API_TOKEN');
  const appName = required(applicationName, 'CHIEF_ACCESS_APP_NAME');
  const target = validateTargetUrl(targetUrl);

  const apps = await listAll(fetchImpl, token, `/accounts/${encodeURIComponent(account)}/access/apps`, 'List Access applications');
  const namedWorkerIds = [...new Set(
    apps
      .filter((app) => app?.name === appName)
      .flatMap((app) => app?.destinations || [])
      .filter((destination) => destination?.type === 'worker' || destination?.type === 'preview_worker')
      .map((destination) => (typeof destination.worker_id === 'string' ? destination.worker_id.trim() : ''))
      .filter(Boolean),
  )];
  if (namedWorkerIds.length !== 1) {
    throw new Error(`Expected exactly one Chief Worker identity for bounded service-token discovery; found ${namedWorkerIds.length}.`);
  }
  const workerId = namedWorkerIds[0];

  const relatedApps = apps.filter((app) =>
    appTargetsWorker(app, workerId)
    || (app?.destinations || []).some((destination) => isExactTargetPublicDestination(destination, target.hostname)),
  );
  const relatedAppIds = [...new Set(relatedApps.map((app) => app?.id).filter(Boolean))];
  if (relatedAppIds.length === 0) {
    throw new Error('No Chief Access applications are eligible for bounded service-token discovery.');
  }

  const policies = [];
  for (const appId of relatedAppIds) {
    const current = await listAll(
      fetchImpl,
      token,
      `/accounts/${encodeURIComponent(account)}/access/apps/${encodeURIComponent(appId)}/policies`,
      'List Chief Access application policies',
    );
    policies.push(...current);
  }

  const serviceTokenIds = collectBoundServiceTokenIds(policies);
  if (serviceTokenIds.length === 0) {
    throw new Error('No existing non-identity service-token binding exists on the bounded Chief Access application set.');
  }
  if (serviceTokenIds.length !== 1) {
    throw new Error(`Multiple service-token identities exist on the bounded Chief Access application set; found ${serviceTokenIds.length}; refusing ambiguous discovery.`);
  }

  const serviceTokens = await listAll(
    fetchImpl,
    token,
    `/accounts/${encodeURIComponent(account)}/access/service_tokens`,
    'List Access service tokens',
  );
  const serviceTokenId = serviceTokenIds[0];
  assertActiveServiceToken(serviceTokens, serviceTokenId, nowMs);

  return {
    serviceTokenId,
    relatedApplicationCount: relatedAppIds.length,
    targetOrigin: target.origin,
  };
}

async function main() {
  const result = await discoverChiefProofModeServiceTokenId({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_ACCESS_API_TOKEN,
    targetUrl: process.env.CHIEF_ACCESS_TARGET_URL,
    applicationName: process.env.CHIEF_ACCESS_APP_NAME || DEFAULT_APP_NAME,
  });
  const githubEnv = required(process.env.GITHUB_ENV, 'GITHUB_ENV');
  appendFileSync(
    githubEnv,
    `CHIEF_CLOUDFLARE_ACCESS_DISCOVERED_SERVICE_TOKEN_ID=${result.serviceTokenId}\n`,
    'utf8',
  );
  console.log('Discovered one active Chief-bound Cloudflare Access service-token selector without exposing its value.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Chief service-token discovery failed.');
    process.exitCode = 1;
  });
}
