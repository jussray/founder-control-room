import { pathToFileURL } from 'node:url';

const API_BASE = 'https://api.cloudflare.com/client/v4';
export const FCR_CLOUDFLARE_ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';
export const FCR_PUBLIC_ZONE = 'foundercontrolroom.org';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function tokenCandidates(env) {
  const values = [
    ['CLOUDFLARE_ACCESS_ADMIN_API_TOKEN', clean(env.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN)],
    ['CLOUDFLARE_ACCESS_API_TOKEN', clean(env.CLOUDFLARE_ACCESS_API_TOKEN)],
    ['CLOUDFLARE_API_TOKEN', clean(env.CLOUDFLARE_API_TOKEN)],
  ].filter(([, value]) => value);

  return values.filter(
    ([, value], index) => values.findIndex(([, other]) => other === value) === index,
  );
}

function validBearerToken(token) {
  return Boolean(token)
    && /^[\x21-\x7E]+$/.test(token)
    && !/\s/.test(token)
    && !/^Bearer\s/i.test(token)
    && !/^['"]|['"]$/.test(token);
}

function normalizedHost(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  const candidate = raw.includes('://') ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return raw.split('/')[0];
  }
}

function hostMatches(pattern, hostname) {
  const rule = normalizedHost(pattern);
  const target = normalizedHost(hostname);
  if (!rule || !target) return false;
  if (rule === target) return true;
  if (rule.startsWith('*.')) {
    const suffix = rule.slice(1);
    return target.endsWith(suffix) && target !== suffix.slice(1);
  }
  return false;
}

export function matchingAccessReasons(application, zone = FCR_PUBLIC_ZONE) {
  const reasons = [];
  if (hostMatches(application?.domain, zone)) reasons.push('domain');

  for (const domain of Array.isArray(application?.self_hosted_domains)
    ? application.self_hosted_domains
    : []) {
    if (hostMatches(domain, zone)) reasons.push('self-hosted-domain');
  }

  for (const destination of Array.isArray(application?.destinations)
    ? application.destinations
    : []) {
    const type = clean(destination?.type).toLowerCase();
    if (type === 'all_workers') reasons.push('all-workers');
    if (type === 'public' && hostMatches(destination?.hostname || destination?.uri, zone)) {
      reasons.push('public-destination');
    }
  }

  return [...new Set(reasons)];
}

async function cloudflareJson({ accountId, token, fetchImpl }, method, path, body) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors.map((item) => item?.code).filter(Number.isInteger)
      : [];
    const error = new Error(`Cloudflare ${method} ${path} failed with status ${response.status}`);
    error.providerStatus = response.status;
    error.providerCodes = codes;
    throw error;
  }
  return payload?.result ?? null;
}

async function selectCredential({ env, accountId, fetchImpl }) {
  const failures = [];
  for (const [source, token] of tokenCandidates(env)) {
    if (!validBearerToken(token)) {
      failures.push({ source, reason: 'invalid-token-format' });
      continue;
    }
    try {
      const organization = await cloudflareJson(
        { accountId, token, fetchImpl },
        'GET',
        `/accounts/${accountId}/access/organizations`,
      );
      return { source, token, organization, failures };
    } catch (error) {
      failures.push({
        source,
        reason: 'provider-read-failed',
        status: Number.isInteger(error?.providerStatus) ? error.providerStatus : null,
        providerCodes: Array.isArray(error?.providerCodes) ? error.providerCodes : [],
      });
    }
  }
  const error = new Error('No configured Cloudflare Access credential can read the Zero Trust organization.');
  error.credentialFailures = failures;
  throw error;
}

export async function reconcileFcrPublicAccessZone({
  env = process.env,
  fetchImpl = fetch,
  apply = false,
  accountId = clean(env.CLOUDFLARE_ACCOUNT_ID) || FCR_CLOUDFLARE_ACCOUNT_ID,
  zone = FCR_PUBLIC_ZONE,
} = {}) {
  const credential = await selectCredential({ env, accountId, fetchImpl });
  const applications = await cloudflareJson(
    { accountId, token: credential.token, fetchImpl },
    'GET',
    `/accounts/${accountId}/access/apps?per_page=1000`,
  );
  const matchingApplications = (Array.isArray(applications) ? applications : [])
    .map((application) => ({
      id: clean(application?.id) || null,
      name: clean(application?.name) || null,
      reasons: matchingAccessReasons(application, zone),
    }))
    .filter((application) => application.reasons.length > 0);

  if (matchingApplications.length > 0) {
    const error = new Error(
      'Explicit Cloudflare Access application coverage matches Founder Control Room; refusing zone exemption until that application is reviewed.',
    );
    error.matchingApplications = matchingApplications;
    throw error;
  }

  const organization = credential.organization && typeof credential.organization === 'object'
    ? credential.organization
    : {};
  const denyUnmatchedRequests = organization.deny_unmatched_requests === true;
  const existingExemptions = Array.isArray(organization.deny_unmatched_requests_exempted_zone_names)
    ? organization.deny_unmatched_requests_exempted_zone_names.map((item) => clean(item).toLowerCase()).filter(Boolean)
    : [];
  const alreadyExempt = existingExemptions.includes(zone.toLowerCase());

  const receipt = {
    version: 1,
    mutationPerformed: false,
    accountId,
    zone,
    credentialSource: credential.source,
    credentialFailures: credential.failures,
    denyUnmatchedRequests,
    alreadyExempt,
    matchingApplicationCount: matchingApplications.length,
    action: 'none',
  };

  if (!denyUnmatchedRequests) {
    return { ...receipt, action: 'deny-unmatched-disabled' };
  }
  if (alreadyExempt) {
    return { ...receipt, action: 'already-exempt' };
  }
  if (!apply) {
    return { ...receipt, action: 'would-add-zone-exemption' };
  }

  const nextExemptions = [...new Set([...existingExemptions, zone.toLowerCase()])].sort();
  const updated = await cloudflareJson(
    { accountId, token: credential.token, fetchImpl },
    'PUT',
    `/accounts/${accountId}/access/organizations`,
    { deny_unmatched_requests_exempted_zone_names: nextExemptions },
  );
  const verifiedExemptions = Array.isArray(updated?.deny_unmatched_requests_exempted_zone_names)
    ? updated.deny_unmatched_requests_exempted_zone_names.map((item) => clean(item).toLowerCase())
    : [];
  if (!verifiedExemptions.includes(zone.toLowerCase())) {
    throw new Error('Cloudflare accepted the update but did not return the Founder Control Room zone exemption.');
  }

  return {
    ...receipt,
    mutationPerformed: true,
    alreadyExempt: true,
    action: 'added-zone-exemption',
  };
}

function printReceipt(receipt) {
  console.log(JSON.stringify(receipt, null, 2));
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const apply = process.argv.includes('--apply');
  reconcileFcrPublicAccessZone({ apply })
    .then(printReceipt)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      if (Array.isArray(error?.credentialFailures)) {
        console.error(JSON.stringify({ credentialFailures: error.credentialFailures }, null, 2));
      }
      if (Array.isArray(error?.matchingApplications)) {
        console.error(JSON.stringify({ matchingApplications: error.matchingApplications }, null, 2));
      }
      process.exitCode = 1;
    });
}
