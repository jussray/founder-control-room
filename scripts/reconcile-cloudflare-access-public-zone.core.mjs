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

function normalizePublicUri(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

export function publicDestinationTargetsHost(destination, hostname = FCR_PUBLIC_ZONE) {
  if (clean(destination?.type).toLowerCase() !== 'public') return false;
  const uri = normalizePublicUri(destination?.uri || destination?.hostname);
  const target = clean(hostname).toLowerCase();
  return uri === target || uri === `${target}/*` || uri.startsWith(`${target}/`);
}

export function appHasExactPublicDestination(app, hostname = FCR_PUBLIC_ZONE) {
  return (Array.isArray(app?.destinations) ? app.destinations : [])
    .some((destination) => publicDestinationTargetsHost(destination, hostname));
}

export function appHasOnlyManagedPublicDestination(app, hostname = FCR_PUBLIC_ZONE) {
  const destinations = Array.isArray(app?.destinations) ? app.destinations : [];
  return destinations.length === 1
    && clean(destinations[0]?.type).toLowerCase() === 'public'
    && normalizePublicUri(destinations[0]?.uri || destinations[0]?.hostname)
      === `${clean(hostname).toLowerCase()}/*`;
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

export function matchingAccessReasons(application, zone = FCR_PUBLIC_ZONE) {
  const reasons = [];
  if (appHasExactPublicDestination(application, zone)) reasons.push('public-destination');
  const destinations = Array.isArray(application?.destinations) ? application.destinations : [];
  if (destinations.some((destination) => clean(destination?.type).toLowerCase() === 'all_workers')) {
    reasons.push('all-workers');
  }
  return reasons;
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
      const applications = await cloudflareJson(
        { token, fetchImpl },
        'GET',
        `/accounts/${accountId}/access/apps?per_page=1000`,
      );
      return {
        source,
        token,
        applications: Array.isArray(applications) ? applications : [],
        failures,
      };
    } catch (error) {
      failures.push({
        source,
        reason: 'provider-read-failed',
        status: Number.isInteger(error?.providerStatus) ? error.providerStatus : null,
        providerCodes: Array.isArray(error?.providerCodes) ? error.providerCodes : [],
        nextAction: 'verify token scope and Cloudflare Access Apps and Policies permissions for this account',
      });
    }
  }

  const error = new Error(
    apply
      ? 'The dedicated Cloudflare Access admin credential could not read Access applications; mutation is blocked.'
      : 'The dedicated Cloudflare Access read credential could not read Access applications.',
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

async function listPolicies({ token, fetchImpl, accountId, appId }) {
  const result = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${accountId}/access/apps/${encodeURIComponent(appId)}/policies?per_page=1000`,
  );
  return Array.isArray(result) ? result : [];
}

async function createPublicBypassApplication({ token, fetchImpl, accountId, zone }) {
  return cloudflareJson(
    { token, fetchImpl },
    'POST',
    `/accounts/${accountId}/access/apps`,
    {
      name: FCR_PUBLIC_ACCESS_APP_NAME,
      type: 'self_hosted',
      domain: zone,
      session_duration: '24h',
      destinations: [{ type: 'public', uri: `${zone}/*` }],
      policies: [{
        name: 'Bypass public Founder Control Room apex',
        decision: 'bypass',
        include: [{ everyone: {} }],
        precedence: 1,
      }],
    },
  );
}

async function deleteApplication({ token, fetchImpl, accountId, appId }) {
  await cloudflareJson(
    { token, fetchImpl },
    'DELETE',
    `/accounts/${accountId}/access/apps/${encodeURIComponent(appId)}`,
  );
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
    rollbackPerformed: false,
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
    managedApplicationId: null,
  };
}

function attachCredentialFailure(error, credential) {
  error.credentialSource = credential?.source ?? null;
  error.credentialFailures = credential?.failures ?? [];
  return error;
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

  const exactPublicApps = credential.applications
    .filter((application) => appHasExactPublicDestination(application, zone));
  const managedApps = exactPublicApps
    .filter((application) => clean(application?.name) === FCR_PUBLIC_ACCESS_APP_NAME);
  const foreignPublicApps = exactPublicApps
    .filter((application) => clean(application?.name) !== FCR_PUBLIC_ACCESS_APP_NAME);

  const receipt = {
    ...receiptBase({ apply, accountId: canonicalAccountId, zone }),
    credentialSource: credential.source,
    credentialFailures: credential.failures,
    matchingApplicationCount: exactPublicApps.length,
  };

  if (managedApps.length > 1) {
    const error = new Error('More than one managed FCR public-bypass Access application exists; refusing automatic repair.');
    error.classification = 'duplicate-managed-public-bypass';
    error.matchingApplications = managedApps;
    throw attachCredentialFailure(error, credential);
  }

  const existingManaged = managedApps[0] || null;
  if (existingManaged) {
    if (!appHasOnlyManagedPublicDestination(existingManaged, zone)) {
      const error = new Error('The managed FCR public-bypass application destination drifted from the exact public apex scope.');
      error.classification = 'managed-public-bypass-drift';
      error.matchingApplications = [existingManaged];
      throw attachCredentialFailure(error, credential);
    }

    const policies = await listPolicies({
      token: credential.token,
      fetchImpl,
      accountId: canonicalAccountId,
      appId: existingManaged.id,
    });
    if (!policies.some(isEveryoneBypassPolicy)) {
      const error = new Error('The managed FCR public-bypass application is missing the required Everyone bypass policy.');
      error.classification = 'managed-public-bypass-policy-drift';
      error.matchingApplications = [existingManaged];
      throw attachCredentialFailure(error, credential);
    }

    return {
      ...receipt,
      state: 'clear',
      action: 'already-public-bypass',
      managedApplicationId: clean(existingManaged.id) || null,
      nextAction: 'run exact-head anonymous Playwright and verify the public front door',
    };
  }

  if (foreignPublicApps.length > 0) {
    const error = new Error(
      'An existing non-managed Access application already owns the Founder Control Room public destination; manual review is required before mutation.',
    );
    error.classification = 'existing-public-access-app-requires-review';
    error.matchingApplications = foreignPublicApps;
    throw attachCredentialFailure(error, credential);
  }

  if (!apply) {
    return {
      ...receipt,
      state: 'attention',
      action: 'would-create-public-bypass',
      blocker: 'no exact managed public Access destination exists for foundercontrolroom.org/*',
      nextAction: 'founder-approved apply may create only the exact public apex destination with an Everyone bypass policy',
    };
  }

  if (credential.source !== 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN') {
    throw new Error('Mutation authority must come from CLOUDFLARE_ACCESS_ADMIN_API_TOKEN.');
  }

  let createdApp = null;
  try {
    createdApp = await createPublicBypassApplication({
      token: credential.token,
      fetchImpl,
      accountId: canonicalAccountId,
      zone,
    });
    const appId = clean(createdApp?.id);
    if (!appId) throw new Error('CREATED_ACCESS_APP_ID_MISSING');
    if (clean(createdApp?.name) !== FCR_PUBLIC_ACCESS_APP_NAME
      || !appHasOnlyManagedPublicDestination(createdApp, zone)) {
      throw new Error('CREATED_PUBLIC_BYPASS_SCOPE_MISMATCH');
    }

    const policies = await listPolicies({
      token: credential.token,
      fetchImpl,
      accountId: canonicalAccountId,
      appId,
    });
    if (!policies.some(isEveryoneBypassPolicy)) {
      throw new Error('CREATED_PUBLIC_BYPASS_POLICY_MISSING');
    }

    return {
      ...receipt,
      state: 'mutated-needs-browser-proof',
      mutationPerformed: true,
      matchingApplicationCount: 1,
      action: 'created-public-bypass',
      managedApplicationId: appId,
      nextAction: 'run exact-head anonymous Playwright; rollback this created app if browser proof fails',
    };
  } catch (error) {
    let rollbackPerformed = false;
    if (clean(createdApp?.id)) {
      try {
        await deleteApplication({
          token: credential.token,
          fetchImpl,
          accountId: canonicalAccountId,
          appId: clean(createdApp.id),
        });
        rollbackPerformed = true;
      } catch {
        rollbackPerformed = false;
      }
    }
    error.classification = error.classification || 'provider-apply-failed';
    error.credentialSource = credential.source;
    error.credentialFailures = credential.failures;
    error.rollbackPerformed = rollbackPerformed;
    error.managedApplicationId = clean(createdApp?.id) || null;
    throw error;
  }
}

export async function rollbackFcrPublicAccessZone({
  env = process.env,
  fetchImpl = fetch,
  accountId = clean(env.CLOUDFLARE_ACCOUNT_ID) || FCR_CLOUDFLARE_ACCOUNT_ID,
  zone = FCR_PUBLIC_ZONE,
} = {}) {
  const canonicalAccountId = assertCanonicalAccountAuthority(accountId);
  const raw = await readFile(RECEIPT_PATH, 'utf8');
  const evidence = JSON.parse(raw);

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
      state: evidence?.state || 'unknown',
      action: evidence?.action || 'none',
    };
  }

  const appId = clean(evidence?.managedApplicationId);
  if (!appId) {
    const error = new Error('Rollback receipt is missing the managed application ID.');
    error.classification = 'rollback-managed-app-id-missing';
    throw error;
  }

  const credential = await selectCredential({
    env,
    accountId: canonicalAccountId,
    fetchImpl,
    apply: true,
  });
  const candidates = credential.applications.filter((application) => clean(application?.id) === appId);
  if (candidates.length !== 1) {
    const error = new Error('Rollback could not uniquely reacquire the run-created managed Access application.');
    error.classification = 'rollback-managed-app-not-unique';
    throw attachCredentialFailure(error, credential);
  }

  const candidate = candidates[0];
  if (clean(candidate?.name) !== FCR_PUBLIC_ACCESS_APP_NAME
    || !appHasOnlyManagedPublicDestination(candidate, zone)) {
    const error = new Error('Rollback candidate no longer matches the exact managed FCR public-bypass scope.');
    error.classification = 'rollback-managed-app-drift';
    throw attachCredentialFailure(error, credential);
  }

  await deleteApplication({
    token: credential.token,
    fetchImpl,
    accountId: canonicalAccountId,
    appId,
  });

  return {
    ...evidence,
    observedAt: new Date().toISOString(),
    state: 'blocked',
    rollbackPerformed: true,
    action: 'rolled-back-public-bypass',
    nextAction: 'inspect browser/provider evidence before any retry',
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
      try {
        previous = JSON.parse(await readFile(RECEIPT_PATH, 'utf8'));
      } catch {
        previous = {};
      }
      const receipt = {
        ...base,
        ...(rollback ? previous : {}),
        observedAt: new Date().toISOString(),
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
          : (previous?.matchingApplicationCount ?? null),
        mutationPerformed: previous?.mutationPerformed === true || Boolean(error?.managedApplicationId),
        rollbackPerformed: previous?.rollbackPerformed === true || error?.rollbackPerformed === true,
        managedApplicationId: clean(error?.managedApplicationId) || previous?.managedApplicationId || null,
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
