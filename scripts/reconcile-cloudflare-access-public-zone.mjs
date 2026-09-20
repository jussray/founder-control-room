import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  classifyProviderToken,
  nextCredentialAction,
} from './provider-credential-contract.mjs';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const RECEIPT_PATH = 'test-results/fcr-access-front-door-recovery.json';

export const FCR_CLOUDFLARE_ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';
export const FCR_PUBLIC_ZONE = 'foundercontrolroom.org';
export const FCR_PUBLIC_URL = 'https://foundercontrolroom.org/';
export const FCR_PUBLIC_ACCESS_APP_NAME = 'foundercontrolroom.org - public apex bypass';
export const FCR_SPLIT_PUBLIC_ACCESS_APP_NAME = 'foundercontrolroom.org - public front door and version witness';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rawSecret(env, name) {
  return typeof env?.[name] === 'string' ? env[name] : '';
}

function destinationType(destination) {
  return clean(destination?.type).toLowerCase();
}

function normalizePublicUri(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function publicHost(value) {
  return normalizePublicUri(value).split('/')[0];
}

function browserHosts(zone = FCR_PUBLIC_ZONE) {
  const target = clean(zone).toLowerCase();
  return new Set([target, `www.${target}`]);
}

function splitPublicUris(zone = FCR_PUBLIC_ZONE) {
  const target = clean(zone).toLowerCase();
  return [
    `${target}/*`,
    `www.${target}/*`,
    `api.${target}/version`,
  ];
}

export function isBrowserFacingFcrPublicDestination(destination, zone = FCR_PUBLIC_ZONE) {
  if (destinationType(destination) !== 'public') return false;
  return browserHosts(zone).has(publicHost(destination?.uri || destination?.hostname));
}

export function appHasBrowserFacingFcrDestination(application, zone = FCR_PUBLIC_ZONE) {
  return (Array.isArray(application?.destinations) ? application.destinations : [])
    .some((destination) => isBrowserFacingFcrPublicDestination(destination, zone));
}

export function browserFacingDestinationCount(application, zone = FCR_PUBLIC_ZONE) {
  return (Array.isArray(application?.destinations) ? application.destinations : [])
    .filter((destination) => isBrowserFacingFcrPublicDestination(destination, zone))
    .length;
}

export function matchingAccessReasons(application, zone = FCR_PUBLIC_ZONE) {
  const reasons = [];
  if (appHasBrowserFacingFcrDestination(application, zone)) reasons.push('browser-public-destination');
  const destinations = Array.isArray(application?.destinations) ? application.destinations : [];
  if (destinations.some((destination) => destinationType(destination) === 'all_workers')) {
    reasons.push('all-workers');
  }
  if (destinations.some((destination) => destinationType(destination) === 'worker')) {
    reasons.push('worker');
  }
  return reasons;
}

export function isEveryoneBypassPolicy(policy) {
  if (clean(policy?.decision).toLowerCase() !== 'bypass') return false;
  const include = Array.isArray(policy?.include) ? policy.include : [];
  const require = Array.isArray(policy?.require) ? policy.require : [];
  const exclude = Array.isArray(policy?.exclude) ? policy.exclude : [];
  if (require.length > 0 || exclude.length > 0) return false;
  return include.some(
    (rule) => rule && typeof rule === 'object' && rule.everyone && typeof rule.everyone === 'object',
  );
}

export function isExactFcrSplitPublicApplication(application, zone = FCR_PUBLIC_ZONE) {
  const target = clean(zone).toLowerCase();
  if (!target) return false;
  if (clean(application?.name) !== FCR_SPLIT_PUBLIC_ACCESS_APP_NAME) return false;
  if (clean(application?.type).toLowerCase() !== 'self_hosted') return false;
  if (normalizePublicUri(application?.domain) !== `www.${target}`) return false;
  const destinations = Array.isArray(application?.destinations) ? application.destinations : [];
  if (destinations.length !== 3 || destinations.some((destination) => destinationType(destination) !== 'public')) {
    return false;
  }
  const actual = destinations
    .map((destination) => normalizePublicUri(destination?.uri || destination?.hostname))
    .sort();
  const expected = splitPublicUris(target).sort();
  return actual.every((uri, index) => uri === expected[index]);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function fingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function applicationIdentityFingerprint(application) {
  const copy = structuredClone(application ?? {});
  delete copy.destinations;
  delete copy.created_at;
  delete copy.updated_at;
  return fingerprint(copy);
}

function policyFingerprint(policies) {
  return fingerprint(Array.isArray(policies) ? policies : []);
}

function destinationsFingerprint(destinations) {
  return fingerprint(Array.isArray(destinations) ? destinations : []);
}

function sameDestinations(left, right) {
  return destinationsFingerprint(left) === destinationsFingerprint(right);
}

function assertCanonicalAccountAuthority(accountId) {
  const effectiveAccountId = clean(accountId);
  if (effectiveAccountId === FCR_CLOUDFLARE_ACCOUNT_ID) return FCR_CLOUDFLARE_ACCOUNT_ID;

  const error = new Error(
    'Cloudflare account authority mismatch: Founder Control Room Access recovery is pinned to its canonical provider account.',
  );
  error.classification = 'account-authority-mismatch';
  error.expectedAccountId = FCR_CLOUDFLARE_ACCOUNT_ID;
  error.suppliedAccountIdPresent = Boolean(effectiveAccountId);
  error.nextAction = 'remove or correct CLOUDFLARE_ACCOUNT_ID; FCR recovery cannot target another Cloudflare account';
  throw error;
}

function tokenCandidates(env, { apply = false } = {}) {
  const name = apply
    ? 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN'
    : 'CLOUDFLARE_ACCESS_API_TOKEN';
  const value = rawSecret(env, name);
  return value.length > 0 ? [[name, value]] : [];
}

async function cloudflareJson({ token, fetchImpl }, method, path, body) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

async function listApplications({ token, fetchImpl, accountId }) {
  const result = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${accountId}/access/apps?per_page=1000`,
  );
  return Array.isArray(result) ? result : [];
}

async function getApplication({ token, fetchImpl, accountId, appId }) {
  return cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${accountId}/access/apps/${encodeURIComponent(appId)}`,
  );
}

async function listPolicies({ token, fetchImpl, accountId, appId }) {
  const result = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${accountId}/access/apps/${encodeURIComponent(appId)}/policies?per_page=1000`,
  );
  return Array.isArray(result) ? result : [];
}

async function updateDestinations({
  token,
  fetchImpl,
  accountId,
  appId,
  destinations,
  expectedCurrentDestinations = null,
  expectedIdentityFingerprint = null,
}) {
  const current = await getApplication({ token, fetchImpl, accountId, appId });
  const domain = clean(current?.domain);
  const type = clean(current?.type);
  if (!domain || type !== 'self_hosted') {
    const error = new Error('Access destination mutation requires a self-hosted application with a stable provider domain.');
    error.classification = 'browser-access-source-shape-unsupported';
    error.mutationOutcome = 'not-attempted';
    throw error;
  }
  if (expectedCurrentDestinations
    && !sameDestinations(current?.destinations, expectedCurrentDestinations)) {
    const error = new Error('Access destinations changed after observation; refusing to overwrite newer provider state.');
    error.classification = 'browser-access-source-drift-before-write';
    error.mutationOutcome = 'not-attempted';
    throw error;
  }
  if (expectedIdentityFingerprint
    && applicationIdentityFingerprint(current) !== expectedIdentityFingerprint) {
    const error = new Error('Access application identity changed after observation; refusing provider mutation.');
    error.classification = 'browser-access-source-drift-before-write';
    error.mutationOutcome = 'not-attempted';
    throw error;
  }
  return cloudflareJson(
    { token, fetchImpl },
    'PUT',
    `/accounts/${accountId}/access/apps/${encodeURIComponent(appId)}`,
    { domain, type, destinations },
  );
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
        ? 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN is required to detach browser-facing Access destinations.'
        : 'CLOUDFLARE_ACCESS_API_TOKEN is required for Access inspection.',
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
      const applications = await listApplications({ token, fetchImpl, accountId });
      return {
        source,
        token,
        applications,
        failures,
      };
    } catch (error) {
      failures.push({
        source,
        reason: 'provider-read-failed',
        status: Number.isInteger(error?.providerStatus) ? error.providerStatus : null,
        providerCodes: Array.isArray(error?.providerCodes) ? error.providerCodes : [],
        nextAction: 'verify the dedicated FCR Access token scope and account binding',
      });
    }
  }

  const error = new Error('The dedicated Cloudflare Access credential could not inspect Access applications.');
  error.classification = failures.some((failure) => failure.reason === 'provider-read-failed')
    ? 'provider-read-failed'
    : 'provider-credential-invalid';
  error.credentialFailures = failures;
  throw error;
}

function receiptBase({ apply, accountId, zone }) {
  return {
    schemaVersion: 2,
    scope: 'fcr-access-front-door-recovery',
    desiredState: 'fcr-product-auth-without-cloudflare-access-screen',
    observedAt: new Date().toISOString(),
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    expectedHeadSha: process.env.EXPECTED_HEAD_SHA || process.env.GITHUB_SHA || null,
    state: 'unknown',
    applyRequested: apply,
    mutationPerformed: false,
    rollbackPerformed: false,
    accountId,
    zone,
    credentialSource: null,
    credentialFailures: [],
    denyUnmatchedRequests: null,
    alreadyExempt: null,
    matchingApplicationCount: null,
    browserAccessDestinationCount: null,
    preservedNonBrowserDestinationCount: null,
    action: 'none',
    classification: null,
    blocker: null,
    nextAction: null,
    sourceApplicationId: null,
    originalDestinations: null,
    expectedPostDestinations: null,
    sourceIdentityFingerprint: null,
    sourcePolicyFingerprint: null,
  };
}

function attachCredentialFailure(error, credential) {
  error.credentialSource = credential?.source ?? null;
  error.credentialFailures = credential?.failures ?? [];
  return error;
}

function browserApplications(applications, zone) {
  return (Array.isArray(applications) ? applications : [])
    .filter((application) => appHasBrowserFacingFcrDestination(application, zone));
}

function totalBrowserDestinations(applications, zone) {
  return browserApplications(applications, zone)
    .reduce((total, application) => total + browserFacingDestinationCount(application, zone), 0);
}

function withoutBrowserDestinations(application, zone) {
  return (Array.isArray(application?.destinations) ? application.destinations : [])
    .filter((destination) => !isBrowserFacingFcrPublicDestination(destination, zone))
    .map((destination) => structuredClone(destination));
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
  const matching = browserApplications(credential.applications, zone);
  const receipt = {
    ...receiptBase({ apply, accountId: canonicalAccountId, zone }),
    credentialSource: credential.source,
    credentialFailures: credential.failures,
    matchingApplicationCount: matching.length,
    browserAccessDestinationCount: totalBrowserDestinations(credential.applications, zone),
  };

  if (matching.length === 0) {
    return {
      ...receipt,
      state: 'clear',
      action: 'none',
      alreadyExempt: true,
      nextAction: 'verify the FCR-owned sign-in surface and runtime identity with stranger-path Playwright',
    };
  }

  if (matching.length > 1) {
    const error = new Error('More than one Access application targets the FCR public apex; refusing to infer ownership or mutate automatically.');
    error.classification = 'existing-public-access-app-requires-review';
    error.matchingApplications = matching;
    throw attachCredentialFailure(error, credential);
  }

  const source = matching[0];
  const sourceId = clean(source?.id);
  if (!sourceId) {
    const error = new Error('An existing browser-facing Access application has no stable provider ID; manual review is required before mutation.');
    error.classification = 'existing-public-access-app-requires-review';
    error.matchingApplications = [source];
    throw attachCredentialFailure(error, credential);
  }

  if (isExactFcrSplitPublicApplication(source, zone)) {
    let policies;
    try {
      policies = await listPolicies({
        token: credential.token,
        fetchImpl,
        accountId: canonicalAccountId,
        appId: sourceId,
      });
    } catch (error) {
      error.classification = 'provider-read-failed';
      throw attachCredentialFailure(error, credential);
    }

    if (policies.length !== 1 || !isEveryoneBypassPolicy(policies[0])) {
      const error = new Error('The managed FCR public bypass application exists but its exact Everyone Bypass policy has drifted.');
      error.classification = 'managed-public-bypass-policy-drift';
      error.matchingApplications = [source];
      throw attachCredentialFailure(error, credential);
    }

    return {
      ...receipt,
      state: 'clear',
      action: 'already-public-bypass',
      alreadyExempt: true,
      nextAction: 'verify the public front door, Pages-to-Worker service binding, exact /version witness, and protected direct API boundary with stranger-path Playwright',
    };
  }

  const remainingDestinations = withoutBrowserDestinations(source, zone);
  const originalDestinations = (Array.isArray(source?.destinations) ? source.destinations : [])
    .map((destination) => structuredClone(destination));

  if (remainingDestinations.length === 0) {
    const error = new Error(
      'An existing non-managed Access application targets the FCR apex with broader or different destination scope; manual review is required before mutation.',
    );
    error.classification = 'existing-public-access-app-requires-review';
    error.matchingApplications = [source];
    throw attachCredentialFailure(error, credential);
  }

  if (!apply) {
    return {
      ...receipt,
      state: 'attention',
      action: 'would-create-public-bypass',
      alreadyExempt: false,
      preservedNonBrowserDestinationCount: remainingDestinations.length,
      blocker: 'Cloudflare Access currently combines the FCR browser front door with a protected non-browser destination.',
      nextAction: 'an exact founder-approved split may preserve the protected non-browser destination while creating only the bounded public bypass application',
    };
  }

  if (credential.source !== 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN') {
    const error = new Error('Browser Access detachment requires the dedicated Access admin credential.');
    error.classification = 'dedicated-admin-credential-required';
    throw attachCredentialFailure(error, credential);
  }

  let policiesBefore;
  try {
    policiesBefore = await listPolicies({
      token: credential.token,
      fetchImpl,
      accountId: canonicalAccountId,
      appId: sourceId,
    });
  } catch (error) {
    error.classification = 'provider-read-failed';
    throw attachCredentialFailure(error, credential);
  }

  const evidence = {
    sourceApplicationId: sourceId,
    originalDestinations,
    expectedPostDestinations: remainingDestinations,
    sourceIdentityFingerprint: applicationIdentityFingerprint(source),
    sourcePolicyFingerprint: policyFingerprint(policiesBefore),
  };

  try {
    await updateDestinations({
      token: credential.token,
      fetchImpl,
      accountId: canonicalAccountId,
      appId: sourceId,
      destinations: remainingDestinations,
      expectedCurrentDestinations: originalDestinations,
      expectedIdentityFingerprint: evidence.sourceIdentityFingerprint,
    });
  } catch (error) {
    error.classification = error.classification || 'browser-access-detach-write-failed';
    error.recoveryEvidence = evidence;
    error.mutationOutcome = error?.mutationOutcome || 'unknown';
    throw attachCredentialFailure(error, credential);
  }

  let applicationsAfter;
  let sourceAfter;
  try {
    applicationsAfter = await listApplications({
      token: credential.token,
      fetchImpl,
      accountId: canonicalAccountId,
    });
    sourceAfter = applicationsAfter.find((application) => clean(application?.id) === sourceId) ?? null;
  } catch (error) {
    error.classification = 'browser-access-detach-reconcile-required';
    error.recoveryEvidence = evidence;
    error.mutationOutcome = 'unknown';
    throw attachCredentialFailure(error, credential);
  }

  if (!sourceAfter || !sameDestinations(sourceAfter.destinations, remainingDestinations)) {
    const error = new Error('Provider readback did not prove the exact browser-destination detachment.');
    error.classification = 'browser-access-detach-reconcile-required';
    error.recoveryEvidence = evidence;
    error.mutationOutcome = 'unknown';
    throw attachCredentialFailure(error, credential);
  }

  const policiesAfter = await listPolicies({
    token: credential.token,
    fetchImpl,
    accountId: canonicalAccountId,
    appId: sourceId,
  });
  if (applicationIdentityFingerprint(sourceAfter) !== evidence.sourceIdentityFingerprint
    || policyFingerprint(policiesAfter) !== evidence.sourcePolicyFingerprint) {
    const error = new Error('The Access application changed beyond its browser-facing destination list; provider reconciliation is required.');
    error.classification = 'browser-access-source-identity-drift';
    error.recoveryEvidence = evidence;
    error.mutationOutcome = 'performed';
    throw attachCredentialFailure(error, credential);
  }

  const remainingBrowserApps = browserApplications(applicationsAfter, zone);
  if (remainingBrowserApps.length !== 0) {
    const error = new Error('Provider readback still shows Cloudflare Access owning an FCR browser-facing destination.');
    error.classification = 'browser-access-detach-incomplete';
    error.recoveryEvidence = evidence;
    error.mutationOutcome = 'performed';
    error.matchingApplications = remainingBrowserApps;
    throw attachCredentialFailure(error, credential);
  }

  return {
    ...receipt,
    ...evidence,
    state: 'mutated-needs-browser-proof',
    mutationPerformed: true,
    matchingApplicationCount: 0,
    browserAccessDestinationCount: 0,
    preservedNonBrowserDestinationCount: remainingDestinations.length,
    action: 'detached-browser-access',
    nextAction: 'run anonymous Playwright; Cloudflare Access must not intercept the public FCR experience, while FCR-owned founder authentication remains contained',
  };
}

export async function rollbackFcrPublicAccessZone({
  env = process.env,
  fetchImpl = fetch,
  accountId = clean(env.CLOUDFLARE_ACCOUNT_ID) || FCR_CLOUDFLARE_ACCOUNT_ID,
  zone = FCR_PUBLIC_ZONE,
} = {}) {
  const canonicalAccountId = assertCanonicalAccountAuthority(accountId);
  const evidence = JSON.parse(await readFile(RECEIPT_PATH, 'utf8'));

  if (evidence?.scope !== 'fcr-access-front-door-recovery'
    || evidence?.accountId !== canonicalAccountId
    || evidence?.zone !== zone) {
    const error = new Error('Rollback receipt does not match the bounded FCR front-door recovery scope.');
    error.classification = 'rollback-scope-mismatch';
    throw error;
  }

  if (evidence?.mutationPerformed !== true || evidence?.rollbackPerformed === true) {
    return {
      ...evidence,
      observedAt: new Date().toISOString(),
      state: evidence?.state || 'unknown',
      action: evidence?.action || 'none',
    };
  }

  const sourceId = clean(evidence?.sourceApplicationId);
  const originalDestinations = Array.isArray(evidence?.originalDestinations)
    ? evidence.originalDestinations
    : null;
  const expectedPostDestinations = Array.isArray(evidence?.expectedPostDestinations)
    ? evidence.expectedPostDestinations
    : null;
  if (!sourceId || !originalDestinations || !expectedPostDestinations) {
    const error = new Error('Rollback receipt is missing the exact Access source/destination evidence.');
    error.classification = 'rollback-source-evidence-missing';
    throw error;
  }

  const credential = await selectCredential({
    env,
    accountId: canonicalAccountId,
    fetchImpl,
    apply: true,
  });

  const source = credential.applications.find((application) => clean(application?.id) === sourceId) ?? null;
  if (!source || !sameDestinations(source.destinations, expectedPostDestinations)) {
    const error = new Error('Rollback source no longer matches the exact post-detachment destination state.');
    error.classification = 'rollback-source-drift';
    throw attachCredentialFailure(error, credential);
  }

  const policies = await listPolicies({
    token: credential.token,
    fetchImpl,
    accountId: canonicalAccountId,
    appId: sourceId,
  });
  if (applicationIdentityFingerprint(source) !== clean(evidence?.sourceIdentityFingerprint)
    || policyFingerprint(policies) !== clean(evidence?.sourcePolicyFingerprint)) {
    const error = new Error('Rollback source identity or policies drifted after browser Access detachment.');
    error.classification = 'rollback-source-drift';
    throw attachCredentialFailure(error, credential);
  }

  await updateDestinations({
    token: credential.token,
    fetchImpl,
    accountId: canonicalAccountId,
    appId: sourceId,
    destinations: originalDestinations,
    expectedCurrentDestinations: expectedPostDestinations,
    expectedIdentityFingerprint: clean(evidence?.sourceIdentityFingerprint),
  });

  const restored = await getApplication({
    token: credential.token,
    fetchImpl,
    accountId: canonicalAccountId,
    appId: sourceId,
  });
  if (!sameDestinations(restored?.destinations, originalDestinations)) {
    const error = new Error('Provider readback did not prove restoration of the exact pre-detachment destinations.');
    error.classification = 'rollback-reconcile-required';
    throw attachCredentialFailure(error, credential);
  }

  const restoredPolicies = await listPolicies({
    token: credential.token,
    fetchImpl,
    accountId: canonicalAccountId,
    appId: sourceId,
  });
  if (applicationIdentityFingerprint(restored) !== clean(evidence?.sourceIdentityFingerprint)
    || policyFingerprint(restoredPolicies) !== clean(evidence?.sourcePolicyFingerprint)) {
    const error = new Error('Rollback readback detected application identity or policy drift.');
    error.classification = 'rollback-reconcile-required';
    throw attachCredentialFailure(error, credential);
  }

  return {
    ...evidence,
    observedAt: new Date().toISOString(),
    state: 'blocked',
    rollbackPerformed: true,
    action: 'restored-browser-access-after-failed-provider-apply',
    nextAction: 'review provider evidence before another authorized attempt; do not treat the restored Access screen as intended product UX',
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
  const rollback = process.argv.includes('--rollback');
  const apply = process.argv.includes('--apply');
  const suppliedAccountId = clean(process.env.CLOUDFLARE_ACCOUNT_ID);
  const base = receiptBase({
    apply,
    accountId: FCR_CLOUDFLARE_ACCOUNT_ID,
    zone: FCR_PUBLIC_ZONE,
  });

  const operation = rollback
    ? rollbackFcrPublicAccessZone()
    : reconcileFcrPublicAccessZone({ apply });

  operation
    .then(async (receipt) => {
      await writeReceipt(receipt);
      printReceipt(receipt);
    })
    .catch(async (error) => {
      let previous = {};
      if (rollback) {
        try {
          previous = JSON.parse(await readFile(RECEIPT_PATH, 'utf8'));
        } catch {
          previous = {};
        }
      }
      const recoveryEvidence = error?.recoveryEvidence && typeof error.recoveryEvidence === 'object'
        ? error.recoveryEvidence
        : {};
      const receipt = {
        ...base,
        ...(rollback ? previous : {}),
        ...recoveryEvidence,
        observedAt: new Date().toISOString(),
        state: 'blocked',
        accountAuthority: {
          canonicalAccountId: FCR_CLOUDFLARE_ACCOUNT_ID,
          suppliedAccountIdPresent: Boolean(suppliedAccountId),
          matchesCanonical: !suppliedAccountId || suppliedAccountId === FCR_CLOUDFLARE_ACCOUNT_ID,
        },
        credentialSource: error?.credentialSource ?? previous?.credentialSource ?? null,
        credentialFailures: Array.isArray(error?.credentialFailures)
          ? error.credentialFailures
          : (previous?.credentialFailures ?? []),
        matchingApplications: Array.isArray(error?.matchingApplications)
          ? error.matchingApplications
          : [],
        matchingApplicationCount: Array.isArray(error?.matchingApplications)
          ? error.matchingApplications.length
          : (previous?.matchingApplicationCount ?? null),
        mutationPerformed: previous?.mutationPerformed === true
          || error?.mutationOutcome === 'performed'
          || error?.mutationOutcome === 'unknown',
        rollbackPerformed: previous?.rollbackPerformed === true || error?.rollbackPerformed === true,
        blocker: error instanceof Error ? error.message : String(error),
        classification: error?.classification || (rollback ? 'rollback-failed' : 'provider-recovery-failed'),
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
