import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  classifyProviderToken,
  nextCredentialAction,
} from './provider-credential-contract.mjs';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const RECEIPT_PATH = 'test-results/fcr-access-front-door-recovery.json';
export const FCR_CLOUDFLARE_ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';
export const FCR_PUBLIC_ZONE = 'foundercontrolroom.org';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rawSecret(env, name) {
  return typeof env?.[name] === 'string' ? env[name] : '';
}

function tokenCandidates(env, { apply = false } = {}) {
  const name = apply
    ? 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN'
    : 'CLOUDFLARE_ACCESS_API_TOKEN';
  const value = rawSecret(env, name);
  return value.length > 0 ? [[name, value]] : [];
}

function assertCanonicalAccountAuthority(accountId) {
  const effectiveAccountId = clean(accountId);
  if (effectiveAccountId === FCR_CLOUDFLARE_ACCOUNT_ID) {
    return FCR_CLOUDFLARE_ACCOUNT_ID;
  }

  const error = new Error(
    'Cloudflare account authority mismatch: Founder Control Room Access recovery is pinned to its canonical provider account.',
  );
  error.classification = 'account-authority-mismatch';
  error.expectedAccountId = FCR_CLOUDFLARE_ACCOUNT_ID;
  error.suppliedAccountIdPresent = Boolean(effectiveAccountId);
  error.nextAction = 'remove or correct CLOUDFLARE_ACCOUNT_ID; FCR recovery cannot target another Cloudflare account';
  throw error;
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

async function cloudflareJson({ token, fetchImpl }, method, path, body) {
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

async function selectCredential({ env, accountId, fetchImpl, apply }) {
  const failures = [];
  const candidates = tokenCandidates(env, { apply });
  const requiredName = apply
    ? 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN'
    : 'CLOUDFLARE_ACCESS_API_TOKEN';

  if (candidates.length === 0) {
    const error = new Error(
      apply
        ? 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN is required for Access mutation; read-only or general-purpose credentials are not mutation authority.'
        : 'CLOUDFLARE_ACCESS_API_TOKEN is required for Access inspection; admin or general-purpose credentials are not read-authority fallbacks.',
    );
    error.classification = apply
      ? 'dedicated-admin-credential-required'
      : 'dedicated-read-credential-required';
    error.credentialFailures = [{
      source: requiredName,
      reason: 'missing',
      nextAction: nextCredentialAction(requiredName, 'missing'),
    }];
    throw error;
  }

  for (const [source, token] of candidates) {
    const shape = classifyProviderToken(token, { accountId });
    if (!shape.headerSafe) {
      failures.push({
        source,
        reason: shape.classification,
        nextAction: nextCredentialAction(source, shape.classification),
      });
      continue;
    }
    try {
      const organization = await cloudflareJson(
        { token, fetchImpl },
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
        nextAction: 'verify token scope and Cloudflare Access permissions for this account',
      });
    }
  }

  const error = new Error(
    apply
      ? 'The dedicated Cloudflare Access admin credential could not read the Zero Trust organization; mutation is blocked.'
      : 'The dedicated Cloudflare Access read credential could not read the Zero Trust organization.',
  );
  error.classification = failures.some((failure) => failure.reason === 'provider-read-failed')
    ? 'provider-read-failed'
    : 'provider-credential-invalid';
  error.credentialFailures = failures.length > 0
    ? failures
    : [{
        source: requiredName,
        reason: 'missing',
        nextAction: nextCredentialAction(requiredName, 'missing'),
      }];
  throw error;
}

async function resolveCanonicalZone({ token, fetchImpl }, accountId, zone) {
  const zones = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/zones?name=${encodeURIComponent(zone)}&match=all&per_page=50`,
  );
  const matches = (Array.isArray(zones) ? zones : [])
    .filter((candidate) => clean(candidate?.name).toLowerCase() === zone.toLowerCase())
    .filter((candidate) => clean(candidate?.account?.id) === accountId);

  if (matches.length !== 1) {
    const error = new Error(
      'Canonical Founder Control Room Cloudflare zone could not be resolved uniquely inside the pinned account; Access mutation is blocked.',
    );
    error.classification = 'provider-recovery-failed';
    error.nextAction = 'grant Zone Read to the dedicated Access credential and verify foundercontrolroom.org resolves once inside the canonical account';
    throw error;
  }

  const zoneId = clean(matches[0]?.id).toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(zoneId)) {
    const error = new Error(
      'Canonical Founder Control Room Cloudflare zone returned an invalid provider identifier; Access mutation is blocked.',
    );
    error.classification = 'provider-recovery-failed';
    error.nextAction = 'verify Cloudflare Zone Read returns the canonical foundercontrolroom.org zone with a valid zone identifier';
    throw error;
  }
  return zoneId;
}

function scopedMatches(applications, scope, zone) {
  return (Array.isArray(applications) ? applications : [])
    .map((application) => ({
      scope,
      id: clean(application?.id) || null,
      name: clean(application?.name) || null,
      reasons: matchingAccessReasons(application, zone),
    }))
    .filter((application) => application.reasons.length > 0);
}

function receiptBase({ apply, accountId, zone }) {
  return {
    schemaVersion: 2,
    scope: 'fcr-access-front-door-recovery',
    observedAt: new Date().toISOString(),
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    expectedHeadSha: process.env.EXPECTED_HEAD_SHA || process.env.GITHUB_SHA || null,
    state: 'unknown',
    applyRequested: apply,
    mutationPerformed: false,
    accountId,
    zone,
    credentialSource: null,
    credentialFailures: [],
    denyUnmatchedRequests: null,
    alreadyExempt: null,
    matchingApplicationCount: null,
    action: 'none',
    blocker: null,
    nextAction: null,
  };
}

export async function reconcileFcrPublicAccessZone({
  env = process.env,
  fetchImpl = fetch,
  apply = false,
  accountId = clean(env.CLOUDFLARE_ACCOUNT_ID) || FCR_CLOUDFLARE_ACCOUNT_ID,
  zone = FCR_PUBLIC_ZONE,
} = {}) {
  const canonicalAccountId = assertCanonicalAccountAuthority(accountId);
  const credential = await selectCredential({
    env,
    accountId: canonicalAccountId,
    fetchImpl,
    apply,
  });

  let zoneId;
  let accountApplications;
  let zoneApplications;
  try {
    zoneId = await resolveCanonicalZone(
      { token: credential.token, fetchImpl },
      canonicalAccountId,
      zone,
    );
    [accountApplications, zoneApplications] = await Promise.all([
      cloudflareJson(
        { token: credential.token, fetchImpl },
        'GET',
        `/accounts/${canonicalAccountId}/access/apps?per_page=1000`,
      ),
      cloudflareJson(
        { token: credential.token, fetchImpl },
        'GET',
        `/zones/${zoneId}/access/apps?per_page=1000`,
      ),
    ]);
  } catch (error) {
    error.credentialSource = credential.source;
    error.credentialFailures = credential.failures;
    throw error;
  }

  const matchingApplications = [
    ...scopedMatches(accountApplications, 'account', zone),
    ...scopedMatches(zoneApplications, 'zone', zone),
  ];

  if (matchingApplications.length > 0) {
    const error = new Error(
      'Explicit Cloudflare Access application coverage matches Founder Control Room at account or zone scope; refusing zone exemption until that application is reviewed.',
    );
    error.classification = 'explicit-access-application-match';
    error.matchingApplications = matchingApplications;
    error.credentialSource = credential.source;
    error.credentialFailures = credential.failures;
    throw error;
  }

  const organization = credential.organization && typeof credential.organization === 'object'
    ? credential.organization
    : {};
  const denyUnmatchedRequests = organization.deny_unmatched_requests === true;
  const existingExemptions = Array.isArray(organization.deny_unmatched_requests_exempted_zone_names)
    ? organization.deny_unmatched_requests_exempted_zone_names
        .map((item) => clean(item).toLowerCase())
        .filter(Boolean)
    : [];
  const alreadyExempt = existingExemptions.includes(zone.toLowerCase());

  const receipt = {
    ...receiptBase({ apply, accountId: canonicalAccountId, zone }),
    credentialSource: credential.source,
    credentialFailures: credential.failures,
    denyUnmatchedRequests,
    alreadyExempt,
    matchingApplicationCount: matchingApplications.length,
  };

  if (!denyUnmatchedRequests) {
    return {
      ...receipt,
      state: 'clear',
      action: 'deny-unmatched-disabled',
      nextAction: 'run domain authority Playwright and verify the public front door',
    };
  }
  if (alreadyExempt) {
    return {
      ...receipt,
      state: 'clear',
      action: 'already-exempt',
      nextAction: 'run domain authority Playwright and verify the public front door',
    };
  }
  if (!apply) {
    return {
      ...receipt,
      state: 'attention',
      action: 'would-add-zone-exemption',
      blocker: 'deny-unmatched Access protection currently covers the public FCR zone after both account- and zone-scoped Access application inventories returned no matching explicit app',
      nextAction: 'founder-approved run may add only foundercontrolroom.org to the existing exemption list',
    };
  }

  if (credential.source !== 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN') {
    throw new Error('Mutation authority must come from CLOUDFLARE_ACCESS_ADMIN_API_TOKEN.');
  }

  const nextExemptions = [...new Set([...existingExemptions, zone.toLowerCase()])].sort();
  const updated = await cloudflareJson(
    { token: credential.token, fetchImpl },
    'PUT',
    `/accounts/${canonicalAccountId}/access/organizations`,
    { deny_unmatched_requests_exempted_zone_names: nextExemptions },
  );
  const verifiedExemptions = Array.isArray(updated?.deny_unmatched_requests_exempted_zone_names)
    ? updated.deny_unmatched_requests_exempted_zone_names.map((item) => clean(item).toLowerCase())
    : [];
  if (!verifiedExemptions.includes(zone.toLowerCase())) {
    throw new Error(
      'Cloudflare accepted the update but did not return the Founder Control Room zone exemption.',
    );
  }

  return {
    ...receipt,
    state: 'mutated-needs-browser-proof',
    mutationPerformed: true,
    alreadyExempt: true,
    action: 'added-zone-exemption',
    nextAction: 'run exact-head domain authority Playwright before declaring the front door recovered',
  };
}

async function writeReceipt(receipt) {
  await mkdir('test-results', { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function printReceipt(receipt) {
  console.log(JSON.stringify(receipt, null, 2));
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const apply = process.argv.includes('--apply');
  const suppliedAccountId = clean(process.env.CLOUDFLARE_ACCOUNT_ID);
  const base = receiptBase({
    apply,
    accountId: FCR_CLOUDFLARE_ACCOUNT_ID,
    zone: FCR_PUBLIC_ZONE,
  });

  reconcileFcrPublicAccessZone({ apply })
    .then(async (receipt) => {
      await writeReceipt(receipt);
      printReceipt(receipt);
    })
    .catch(async (error) => {
      const receipt = {
        ...base,
        state: 'blocked',
        accountAuthority: {
          canonicalAccountId: FCR_CLOUDFLARE_ACCOUNT_ID,
          suppliedAccountIdPresent: Boolean(suppliedAccountId),
          matchesCanonical: !suppliedAccountId || suppliedAccountId === FCR_CLOUDFLARE_ACCOUNT_ID,
        },
        credentialSource: error?.credentialSource ?? null,
        credentialFailures: Array.isArray(error?.credentialFailures)
          ? error.credentialFailures
          : [],
        matchingApplications: Array.isArray(error?.matchingApplications)
          ? error.matchingApplications
          : [],
        matchingApplicationCount: Array.isArray(error?.matchingApplications)
          ? error.matchingApplications.length
          : null,
        blocker: error instanceof Error ? error.message : String(error),
        classification: error?.classification || 'provider-recovery-failed',
        nextAction: error?.nextAction
          || (Array.isArray(error?.credentialFailures) && error.credentialFailures[0]?.nextAction
            ? error.credentialFailures[0].nextAction
            : 'review the structured receipt and correct the bounded provider authority before retrying'),
      };
      await writeReceipt(receipt);
      printReceipt(receipt);
      process.exitCode = 1;
    });
}
