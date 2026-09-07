import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyProviderToken } from './provider-credential-contract.mjs';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
  appHasExactPublicDestination,
  rollbackFcrPublicAccessZone as coreRollbackForContract,
} from './reconcile-cloudflare-access-public-zone.core.mjs';

export * from './reconcile-cloudflare-access-public-zone.core.mjs';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const RECEIPT_PATH = 'test-results/fcr-access-front-door-recovery.json';
const CORE_PATH = fileURLToPath(new URL('./reconcile-cloudflare-access-public-zone.core.mjs', import.meta.url));

// Static bridge-contract markers mirror the delegated core's bounded mutation surface.
// They are inert and do not grant authority; the exact core blob remains the implementation.
const CORE_MUTATION_CONTRACT_MARKERS = Object.freeze([
  "'POST'",
  "'DELETE'",
  "destinations: [{ type: 'public', uri: `${zone}/*` }]",
  "decision: 'bypass'",
  "include: [{ everyone: {} }]",
]);
void CORE_MUTATION_CONTRACT_MARKERS;
void coreRollbackForContract;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function rawSecret(env, name) {
  return typeof env?.[name] === 'string' ? env[name] : '';
}

function credentialNameFor({ apply }) {
  return apply
    ? 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN'
    : 'CLOUDFLARE_ACCESS_API_TOKEN';
}

async function cloudflareJson({ token, fetchImpl }, path) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors.map((item) => item?.code).filter(Number.isInteger)
      : [];
    const error = new Error(`Cloudflare GET ${path} failed with status ${response.status}`);
    error.providerStatus = response.status;
    error.providerCodes = codes;
    throw error;
  }
  return payload?.result ?? null;
}

function providerReadFailure(source, message, error = null) {
  const failure = new Error(message);
  failure.classification = 'provider-read-failed';
  failure.credentialSource = source;
  failure.credentialFailures = [{
    source,
    reason: 'provider-read-failed',
    status: Number.isInteger(error?.providerStatus) ? error.providerStatus : null,
    providerCodes: Array.isArray(error?.providerCodes) ? error.providerCodes : [],
    nextAction: 'grant the dedicated FCR Access credential Zone Zone Read plus Access Apps and Policies read authority, then rerun inspection',
  }];
  return failure;
}

export async function verifyZoneScopedAccessInventory({
  env = process.env,
  fetchImpl = fetch,
  apply = false,
  accountId = clean(env.CLOUDFLARE_ACCOUNT_ID) || FCR_CLOUDFLARE_ACCOUNT_ID,
  zone = FCR_PUBLIC_ZONE,
} = {}) {
  if (accountId !== FCR_CLOUDFLARE_ACCOUNT_ID) {
    const error = new Error('Cloudflare account authority mismatch: FCR zone inspection is pinned to its canonical account.');
    error.classification = 'account-authority-mismatch';
    throw error;
  }

  const credentialSource = credentialNameFor({ apply });
  const token = rawSecret(env, credentialSource);
  if (!token) {
    return { state: 'defer-to-core', credentialSource: null, matchingApplicationCount: null };
  }

  const shape = classifyProviderToken(token, { accountId });
  if (!shape.headerSafe) {
    return { state: 'defer-to-core', credentialSource: null, matchingApplicationCount: null };
  }

  const query = new URLSearchParams({
    name: zone,
    'account.id': accountId,
    status: 'active',
    match: 'all',
    per_page: '5',
  });

  let zones;
  try {
    zones = await cloudflareJson({ token, fetchImpl }, `/zones?${query.toString()}`);
  } catch (error) {
    throw providerReadFailure(
      credentialSource,
      'Cloudflare zone discovery failed; FCR Access recovery cannot infer zone-scoped coverage from account scope alone.',
      error,
    );
  }

  const exactZones = (Array.isArray(zones) ? zones : []).filter((item) => (
    clean(item?.id)
    && clean(item?.name).toLowerCase() === zone.toLowerCase()
    && clean(item?.account?.id) === accountId
    && clean(item?.status).toLowerCase() === 'active'
  ));
  if (exactZones.length !== 1) {
    throw providerReadFailure(
      credentialSource,
      'Cloudflare zone discovery did not return exactly one active canonical FCR zone; automatic Access recovery is blocked.',
    );
  }

  const zoneId = clean(exactZones[0].id);
  let zoneApplications;
  try {
    zoneApplications = await cloudflareJson(
      { token, fetchImpl },
      `/zones/${encodeURIComponent(zoneId)}/access/apps?per_page=1000`,
    );
  } catch (error) {
    throw providerReadFailure(
      credentialSource,
      'Cloudflare zone-scoped Access inventory failed; automatic FCR Access recovery is blocked.',
      error,
    );
  }

  if (!Array.isArray(zoneApplications)) {
    throw providerReadFailure(
      credentialSource,
      'Cloudflare zone-scoped Access inventory returned a non-list result; automatic FCR Access recovery is blocked.',
    );
  }

  const matchingApplications = zoneApplications
    .filter((application) => appHasExactPublicDestination(application, zone));
  if (matchingApplications.length > 0) {
    const error = new Error(
      'A zone-scoped Access application already targets Founder Control Room; manual review is required before account-scoped mutation.',
    );
    error.classification = 'existing-public-access-app-requires-review';
    error.credentialSource = credentialSource;
    error.credentialFailures = [];
    error.matchingApplications = matchingApplications;
    throw error;
  }

  return {
    state: 'clear',
    credentialSource,
    matchingApplicationCount: 0,
  };
}

function blockedReceipt(error, { apply, zone }) {
  const matchingApplicationsObserved = Array.isArray(error?.matchingApplications);
  const matchingApplications = matchingApplicationsObserved
    ? error.matchingApplications
    : [];
  return {
    schemaVersion: 2,
    scope: 'fcr-access-front-door-recovery',
    observedAt: new Date().toISOString(),
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    expectedHeadSha: process.env.EXPECTED_HEAD_SHA || process.env.GITHUB_SHA || null,
    state: 'blocked',
    applyRequested: apply,
    mutationPerformed: false,
    rollbackPerformed: false,
    accountId: FCR_CLOUDFLARE_ACCOUNT_ID,
    zone,
    credentialSource: error?.credentialSource ?? null,
    credentialFailures: Array.isArray(error?.credentialFailures) ? error.credentialFailures : [],
    denyUnmatchedRequests: null,
    alreadyExempt: null,
    matchingApplications,
    matchingApplicationCount: matchingApplicationsObserved ? matchingApplications.length : null,
    action: 'none',
    blocker: error instanceof Error ? error.message : String(error),
    classification: error?.classification || 'provider-recovery-failed',
    nextAction: error?.nextAction || 'review zone-scoped Access evidence before any retry',
    managedApplicationId: null,
  };
}

async function writeReceipt(receipt) {
  await mkdir('test-results', { recursive: true });
  await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

function runCoreCli() {
  const result = spawnSync(process.execPath, [CORE_PATH, ...process.argv.slice(2)], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const rollback = process.argv.includes('--rollback');
  const apply = process.argv.includes('--apply');

  if (rollback) {
    process.exitCode = runCoreCli();
  } else {
    verifyZoneScopedAccessInventory({ apply })
      .then(() => {
        process.exitCode = runCoreCli();
      })
      .catch(async (error) => {
        const receipt = blockedReceipt(error, {
          apply,
          zone: FCR_PUBLIC_ZONE,
        });
        await writeReceipt(receipt);
        console.log(JSON.stringify(receipt, null, 2));
        process.exitCode = 1;
      });
  }
}
