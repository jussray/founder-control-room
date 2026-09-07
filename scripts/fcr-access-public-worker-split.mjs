import { createHash } from 'node:crypto';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ACCESS_APP_NAME,
  FCR_PUBLIC_ZONE,
  isEveryoneBypassPolicy,
} from './reconcile-cloudflare-access-public-zone.mjs';
import { classifyProviderToken } from './provider-credential-contract.mjs';

const API_BASE = 'https://api.cloudflare.com/client/v4';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
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

export function isWholeSitePublicDestination(destination, zone = FCR_PUBLIC_ZONE) {
  if (destinationType(destination) !== 'public') return false;
  const uri = normalizePublicUri(destination?.uri || destination?.hostname);
  const target = clean(zone).toLowerCase();
  return uri === target || uri === `${target}/*`;
}

export function classifyFcrPublicWorkerSplit(application, zone = FCR_PUBLIC_ZONE) {
  const destinations = Array.isArray(application?.destinations)
    ? application.destinations
    : [];
  const publicDestinations = destinations.filter((destination) => destinationType(destination) === 'public');
  const workerDestinations = destinations.filter((destination) => destinationType(destination) === 'worker');
  const otherDestinations = destinations.filter(
    (destination) => !['public', 'worker'].includes(destinationType(destination)),
  );
  const wholeSitePublic = publicDestinations.filter((destination) =>
    isWholeSitePublicDestination(destination, zone));

  const eligible = destinations.length === 2
    && wholeSitePublic.length === 1
    && workerDestinations.length === 1
    && otherDestinations.length === 0;

  return {
    eligible,
    totalDestinations: destinations.length,
    publicDestinations: publicDestinations.length,
    workerDestinations: workerDestinations.length,
    otherDestinations: otherDestinations.length,
    wholeSitePublicDestinations: wholeSitePublic.length,
    publicDestination: eligible ? structuredClone(wholeSitePublic[0]) : null,
    workerDestination: eligible ? structuredClone(workerDestinations[0]) : null,
  };
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

function adminToken(env = process.env) {
  const token = typeof env.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN === 'string'
    ? env.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN
    : '';
  if (!token) {
    const error = new Error('CLOUDFLARE_ACCESS_ADMIN_API_TOKEN is required for the split repair.');
    error.classification = 'dedicated-admin-credential-required';
    throw error;
  }
  const shape = classifyProviderToken(token, { accountId: FCR_CLOUDFLARE_ACCOUNT_ID });
  if (!shape.headerSafe) {
    const error = new Error('The dedicated Access admin credential failed header-safety validation.');
    error.classification = 'provider-credential-invalid';
    throw error;
  }
  return token;
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
    const error = new Error(`Cloudflare ${method} ${path} failed with status ${response.status}`);
    error.providerStatus = response.status;
    error.writeAttempted = ['PUT', 'POST', 'DELETE'].includes(method);
    throw error;
  }
  return payload?.result ?? null;
}

async function listApplications({ token, fetchImpl }) {
  const result = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps?per_page=1000`,
  );
  return Array.isArray(result) ? result : [];
}

async function listPolicies({ token, fetchImpl, appId }) {
  const result = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps/${encodeURIComponent(appId)}/policies?per_page=1000`,
  );
  return Array.isArray(result) ? result : [];
}

async function updateDestinations({ token, fetchImpl, appId, destinations }) {
  const current = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps/${encodeURIComponent(appId)}`,
  );
  const domain = clean(current?.domain);
  const type = clean(current?.type);
  if (!domain || type !== 'self_hosted') {
    throw errorWith(
      'split-source-update-shape-unsupported',
      'Destination mutation requires a provider-read self-hosted application with a stable domain and type.',
      { mutationOutcome: 'none', sourceApplicationId: appId },
    );
  }
  return cloudflareJson(
    { token, fetchImpl },
    'PUT',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps/${encodeURIComponent(appId)}`,
    { domain, type, destinations },
  );
}

async function createManagedPublicApplication({ token, fetchImpl, zone }) {
  return cloudflareJson(
    { token, fetchImpl },
    'POST',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps`,
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

async function deleteApplication({ token, fetchImpl, appId }) {
  return cloudflareJson(
    { token, fetchImpl },
    'DELETE',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps/${encodeURIComponent(appId)}`,
  );
}

function wholeSitePublicApplications(applications, zone) {
  return applications.filter((application) =>
    (Array.isArray(application?.destinations) ? application.destinations : [])
      .some((destination) => isWholeSitePublicDestination(destination, zone)));
}

function isExactManagedPublicApplication(application, zone) {
  const destinations = Array.isArray(application?.destinations) ? application.destinations : [];
  return clean(application?.name) === FCR_PUBLIC_ACCESS_APP_NAME
    && destinations.length === 1
    && isWholeSitePublicDestination(destinations[0], zone);
}

function exactManagedPublicApplications(applications, zone) {
  return applications.filter((application) => isExactManagedPublicApplication(application, zone));
}

function namedManagedPublicApplications(applications) {
  return applications.filter(
    (application) => clean(application?.name) === FCR_PUBLIC_ACCESS_APP_NAME,
  );
}

function errorWith(classification, message, fields = {}) {
  const error = new Error(message);
  error.classification = classification;
  Object.assign(error, fields);
  return error;
}

async function readSourceState({ token, fetchImpl, sourceId, zone }) {
  const applications = await listApplications({ token, fetchImpl });
  const source = applications.find((application) => clean(application?.id) === sourceId) ?? null;
  const managed = exactManagedPublicApplications(applications, zone);
  const namedManaged = namedManagedPublicApplications(applications);
  return { applications, source, managed, namedManaged };
}

function isWorkerOnly(application) {
  const destinations = Array.isArray(application?.destinations) ? application.destinations : [];
  return destinations.length === 1 && destinationType(destinations[0]) === 'worker';
}

async function proveSourceIdentity({
  token,
  fetchImpl,
  source,
  sourceId,
  expectedIdentityFingerprint,
  expectedPolicyFingerprint,
}) {
  if (applicationIdentityFingerprint(source) !== expectedIdentityFingerprint) return false;
  const policies = await listPolicies({ token, fetchImpl, appId: sourceId });
  return policyFingerprint(policies) === expectedPolicyFingerprint;
}

async function restoreOriginalDestinations({
  token,
  fetchImpl,
  sourceId,
  zone,
  originalDestinations,
  sourceIdentityFingerprint,
  sourcePolicyFingerprint,
}) {
  try {
    await updateDestinations({
      token,
      fetchImpl,
      appId: sourceId,
      destinations: originalDestinations,
    });
  } catch {
    // A failed write response is never evidence that the write did not happen.
    // Re-read below and classify only from provider state.
  }

  let readback;
  try {
    readback = await readSourceState({ token, fetchImpl, sourceId, zone });
  } catch {
    throw errorWith(
      'split-rollback-reconcile-required',
      'The original-destination restore has an unknown provider outcome; no further write is allowed.',
      { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
    );
  }

  const restored = classifyFcrPublicWorkerSplit(readback.source, zone).eligible;
  const identityPreserved = restored && await proveSourceIdentity({
    token,
    fetchImpl,
    source: readback.source,
    sourceId,
    expectedIdentityFingerprint: sourceIdentityFingerprint,
    expectedPolicyFingerprint: sourcePolicyFingerprint,
  });
  if (!restored || !identityPreserved) {
    throw errorWith(
      'split-rollback-reconcile-required',
      'Provider readback did not prove restoration of the original mixed Access application.',
      { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
    );
  }
  return readback.source;
}

export async function executeFcrPublicWorkerSplit({
  env = process.env,
  fetchImpl = fetch,
  zone = FCR_PUBLIC_ZONE,
} = {}) {
  const token = adminToken(env);
  const applications = await listApplications({ token, fetchImpl });
  const matching = wholeSitePublicApplications(applications, zone);
  if (matching.length !== 1) {
    throw errorWith(
      'split-topology-not-unique',
      'Split repair requires exactly one Access application with a whole-site FCR public destination.',
      { mutationOutcome: 'none' },
    );
  }

  const source = matching[0];
  if (clean(source?.name) === FCR_PUBLIC_ACCESS_APP_NAME) {
    throw errorWith(
      'split-managed-app-not-eligible',
      'The whole-site destination is already owned by the managed public application; split repair is not applicable.',
      { mutationOutcome: 'none' },
    );
  }

  const topology = classifyFcrPublicWorkerSplit(source, zone);
  if (!topology.eligible) {
    throw errorWith(
      'split-topology-not-eligible',
      'Split repair is limited to exactly one whole-site public destination plus exactly one Worker destination.',
      { mutationOutcome: 'none' },
    );
  }

  const sourceId = clean(source?.id);
  if (!sourceId) {
    throw errorWith('split-source-id-missing', 'Split source application has no stable provider ID.', {
      mutationOutcome: 'none',
    });
  }

  const policiesBefore = await listPolicies({ token, fetchImpl, appId: sourceId });
  if (policiesBefore.some(isEveryoneBypassPolicy)) {
    throw errorWith(
      'split-source-already-everyone-bypass',
      'The mixed Access application already contains an Everyone bypass; split repair refuses to widen or reinterpret it.',
      { mutationOutcome: 'none' },
    );
  }

  const originalDestinations = structuredClone(source.destinations);
  const sourceIdentityBefore = applicationIdentityFingerprint(source);
  const policyFingerprintBefore = policyFingerprint(policiesBefore);

  try {
    await updateDestinations({
      token,
      fetchImpl,
      appId: sourceId,
      destinations: [topology.workerDestination],
    });
  } catch {
    let readback;
    try {
      readback = await readSourceState({ token, fetchImpl, sourceId, zone });
    } catch {
      throw errorWith(
        'split-source-update-reconcile-required',
        'The Worker-only destination update has an unknown provider outcome; no further write is allowed.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }
    if (!isWorkerOnly(readback.source)) {
      if (classifyFcrPublicWorkerSplit(readback.source, zone).eligible) {
        throw errorWith(
          'split-source-update-not-performed',
          'Provider readback proves the Worker-only destination update did not occur; retry requires a new authorized run.',
          { mutationOutcome: 'none', sourceApplicationId: sourceId },
        );
      }
      throw errorWith(
        'split-source-update-reconcile-required',
        'Provider readback cannot prove whether the Worker-only destination update succeeded.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }
  }

  const afterNarrow = await readSourceState({ token, fetchImpl, sourceId, zone });
  if (!isWorkerOnly(afterNarrow.source)) {
    throw errorWith(
      'split-source-narrowing-unverified',
      'Worker-only destination state was not independently verified.',
      { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
    );
  }
  if (!(await proveSourceIdentity({
    token,
    fetchImpl,
    source: afterNarrow.source,
    sourceId,
    expectedIdentityFingerprint: sourceIdentityBefore,
    expectedPolicyFingerprint: policyFingerprintBefore,
  }))) {
    throw errorWith(
      'split-source-identity-drift',
      'The source Access application changed beyond its destination list; public-app creation is blocked pending reconciliation.',
      { mutationOutcome: 'performed', sourceApplicationId: sourceId },
    );
  }

  let managedApp = null;
  try {
    managedApp = await createManagedPublicApplication({ token, fetchImpl, zone });
  } catch {
    let readback;
    try {
      readback = await readSourceState({ token, fetchImpl, sourceId, zone });
    } catch {
      throw errorWith(
        'split-public-create-reconcile-required',
        'The public-app create has an unknown provider outcome; source remains Worker-only and no further write is allowed.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }
    if (readback.managed.length === 1 && readback.namedManaged.length === 1) {
      [managedApp] = readback.managed;
    } else if (readback.namedManaged.length === 0) {
      await restoreOriginalDestinations({
        token,
        fetchImpl,
        sourceId,
        zone,
        originalDestinations,
        sourceIdentityFingerprint: sourceIdentityBefore,
        sourcePolicyFingerprint: policyFingerprintBefore,
      });
      throw errorWith(
        'split-public-create-not-performed',
        'Provider readback proves the public app was not created; independent readback proves the original mixed destinations were restored.',
        { mutationOutcome: 'none', rollbackPerformed: true, sourceApplicationId: sourceId },
      );
    } else {
      throw errorWith(
        'split-public-create-reconcile-required',
        'Provider readback found a named public application whose exact split ownership or shape is ambiguous.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }
  }

  const managedId = clean(managedApp?.id);
  if (!managedId) {
    throw errorWith('split-public-app-id-missing', 'The managed public application has no stable provider ID.', {
      mutationOutcome: 'performed',
      sourceApplicationId: sourceId,
    });
  }

  const managedPolicies = await listPolicies({ token, fetchImpl, appId: managedId });
  if (!managedPolicies.some(isEveryoneBypassPolicy)) {
    throw errorWith('split-public-bypass-missing', 'The managed public application is missing the required Everyone bypass.', {
      mutationOutcome: 'performed',
      sourceApplicationId: sourceId,
      managedApplicationId: managedId,
    });
  }

  const finalState = await readSourceState({ token, fetchImpl, sourceId, zone });
  if (!isWorkerOnly(finalState.source)
    || !(await proveSourceIdentity({
      token,
      fetchImpl,
      source: finalState.source,
      sourceId,
      expectedIdentityFingerprint: sourceIdentityBefore,
      expectedPolicyFingerprint: policyFingerprintBefore,
    }))
    || finalState.managed.length !== 1
    || finalState.namedManaged.length !== 1
    || clean(finalState.managed[0]?.id) !== managedId) {
    throw errorWith(
      'split-final-readback-mismatch',
      'Final provider readback did not preserve the exact Worker app while creating one exact public app.',
      {
        mutationOutcome: 'performed',
        sourceApplicationId: sourceId,
        managedApplicationId: managedId,
      },
    );
  }

  return {
    schemaVersion: 1,
    scope: 'fcr-access-public-worker-split',
    state: 'mutated-needs-browser-proof',
    mutationOutcome: 'performed',
    mutationPerformed: true,
    rollbackPerformed: false,
    zone,
    sourceApplicationId: sourceId,
    managedApplicationId: managedId,
    originalDestinations,
    workerDestination: structuredClone(topology.workerDestination),
    sourceIdentityFingerprint: sourceIdentityBefore,
    sourcePolicyFingerprint: policyFingerprintBefore,
    splitApplied: true,
    nextAction: 'run anonymous/public and authorized/unauthorized Worker proofs; roll back if any required witness fails',
  };
}

export async function rollbackFcrPublicWorkerSplit({
  receipt,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (receipt?.scope !== 'fcr-access-public-worker-split'
    || receipt?.splitApplied !== true
    || receipt?.mutationOutcome !== 'performed') {
    throw errorWith('split-rollback-receipt-invalid', 'Rollback requires an exact performed split receipt.');
  }

  const token = adminToken(env);
  const sourceId = clean(receipt.sourceApplicationId);
  const managedId = clean(receipt.managedApplicationId);
  const originalDestinations = Array.isArray(receipt.originalDestinations)
    ? receipt.originalDestinations
    : [];
  if (!sourceId || !managedId || originalDestinations.length !== 2) {
    throw errorWith(
      'split-rollback-receipt-invalid',
      'Rollback receipt is missing exact provider identities or original destinations.',
    );
  }

  let state = await readSourceState({ token, fetchImpl, sourceId, zone: receipt.zone });
  const managedById = state.applications.filter(
    (application) => clean(application?.id) === managedId,
  );
  if (managedById.length > 1) {
    throw errorWith(
      'split-rollback-managed-app-ambiguous',
      'Rollback cannot uniquely identify the run-created public application.',
    );
  }

  if (managedById.length === 1) {
    if (!isExactManagedPublicApplication(managedById[0], receipt.zone)) {
      throw errorWith(
        'split-rollback-managed-app-drift',
        'The run-created public application still exists but its shape drifted; rollback refuses to infer safe deletion.',
      );
    }
    try {
      await deleteApplication({ token, fetchImpl, appId: managedId });
    } catch {
      try {
        state = await readSourceState({ token, fetchImpl, sourceId, zone: receipt.zone });
      } catch {
        throw errorWith(
          'split-rollback-reconcile-required',
          'Public-app deletion has an unknown provider outcome; original mixed destinations must not be restored yet.',
          { mutationOutcome: 'unknown' },
        );
      }
      if (state.applications.some((application) => clean(application?.id) === managedId)) {
        throw errorWith(
          'split-rollback-public-delete-not-performed',
          'Provider readback proves the public application still exists; source restoration is blocked to avoid overlapping public ownership.',
          { mutationOutcome: 'performed' },
        );
      }
    }
  }

  state = await readSourceState({ token, fetchImpl, sourceId, zone: receipt.zone });
  if (state.applications.some((application) => clean(application?.id) === managedId)) {
    throw errorWith(
      'split-rollback-public-delete-unverified',
      'Public application removal is not proven; source restoration is blocked.',
    );
  }
  if (!isWorkerOnly(state.source)
    || !(await proveSourceIdentity({
      token,
      fetchImpl,
      source: state.source,
      sourceId,
      expectedIdentityFingerprint: receipt.sourceIdentityFingerprint,
      expectedPolicyFingerprint: receipt.sourcePolicyFingerprint,
    }))) {
    throw errorWith(
      'split-rollback-source-drift',
      'The protected Worker application drifted after the split; rollback refuses to overwrite it.',
    );
  }

  await restoreOriginalDestinations({
    token,
    fetchImpl,
    sourceId,
    zone: receipt.zone,
    originalDestinations,
    sourceIdentityFingerprint: receipt.sourceIdentityFingerprint,
    sourcePolicyFingerprint: receipt.sourcePolicyFingerprint,
  });

  return {
    ...receipt,
    state: 'rolled-back',
    rollbackPerformed: true,
    splitApplied: false,
    nextAction: 're-inspect provider topology before any future repair attempt',
  };
}
