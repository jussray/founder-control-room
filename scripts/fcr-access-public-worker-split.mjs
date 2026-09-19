import { createHash } from 'node:crypto';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
  isEveryoneBypassPolicy,
} from './reconcile-cloudflare-access-public-zone.mjs';
import { classifyProviderToken } from './provider-credential-contract.mjs';

const API_BASE = 'https://api.cloudflare.com/client/v4';

export const FCR_SPLIT_PUBLIC_ACCESS_APP_NAME = 'foundercontrolroom.org - public front door and version witness';

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

function assertCanonicalZone(zone) {
  const normalized = clean(zone).toLowerCase();
  if (normalized === FCR_PUBLIC_ZONE) return FCR_PUBLIC_ZONE;
  throw errorWith(
    'split-zone-authority-mismatch',
    'FCR Access split authority is pinned to foundercontrolroom.org.',
    { mutationOutcome: 'none' },
  );
}

function assertCanonicalAccount(env = process.env) {
  const supplied = clean(env.CLOUDFLARE_ACCOUNT_ID);
  if (!supplied || supplied === FCR_CLOUDFLARE_ACCOUNT_ID) return FCR_CLOUDFLARE_ACCOUNT_ID;
  throw errorWith(
    'account-authority-mismatch',
    'FCR Access split authority is pinned to its canonical Cloudflare account.',
    { mutationOutcome: 'none' },
  );
}

function managedPublicUris(zone = FCR_PUBLIC_ZONE) {
  const target = assertCanonicalZone(zone);
  return [
    `${target}/*`,
    `www.${target}/*`,
    `api.${target}/version`,
  ];
}

export function isWholeSitePublicDestination(destination, zone = FCR_PUBLIC_ZONE) {
  const target = assertCanonicalZone(zone);
  if (destinationType(destination) !== 'public') return false;
  const uri = normalizePublicUri(destination?.uri || destination?.hostname);
  return uri === target || uri === `${target}/*`;
}

export function classifyFcrPublicWorkerSplit(application, zone = FCR_PUBLIC_ZONE) {
  assertCanonicalZone(zone);
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

function destinationFingerprint(destinations) {
  const canonical = (Array.isArray(destinations) ? destinations : [])
    .map((destination) => JSON.stringify(stableValue(destination)))
    .sort();
  return fingerprint(canonical);
}

function sameDestinations(left, right) {
  return destinationFingerprint(left) === destinationFingerprint(right);
}

function parsePublicUri(value) {
  const normalized = normalizePublicUri(value);
  const slash = normalized.indexOf('/');
  if (slash < 0) return { host: normalized, path: '/*' };
  return {
    host: normalized.slice(0, slash),
    path: `/${normalized.slice(slash + 1)}`,
  };
}

function pathCovers(left, right) {
  if (left === '/*') return true;
  if (left === right) return true;
  if (!left.endsWith('*')) return false;
  return right.startsWith(left.slice(0, -1));
}

function publicUrisOverlap(left, right) {
  const a = parsePublicUri(left);
  const b = parsePublicUri(right);
  return a.host === b.host && (pathCovers(a.path, b.path) || pathCovers(b.path, a.path));
}

function managedDestinationCollisions(applications, { sourceId, zone }) {
  const targets = managedPublicUris(zone);
  const collisions = [];
  for (const application of Array.isArray(applications) ? applications : []) {
    if (clean(application?.id) === sourceId) continue;
    const destinations = Array.isArray(application?.destinations) ? application.destinations : [];
    for (const destination of destinations) {
      if (destinationType(destination) !== 'public') continue;
      const actual = normalizePublicUri(destination?.uri || destination?.hostname);
      if (targets.some((target) => publicUrisOverlap(actual, target))) {
        collisions.push({ applicationId: clean(application?.id) || null, uri: actual });
      }
    }
  }
  return collisions;
}

function adminToken(env = process.env) {
  assertCanonicalAccount(env);
  const token = typeof env.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN === 'string'
    ? env.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN
    : '';
  if (!token) {
    throw errorWith(
      'dedicated-admin-credential-required',
      'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN is required for the split repair.',
      { mutationOutcome: 'none' },
    );
  }
  const shape = classifyProviderToken(token, { accountId: FCR_CLOUDFLARE_ACCOUNT_ID });
  if (!shape.headerSafe) {
    throw errorWith(
      'provider-credential-invalid',
      'The dedicated Access admin credential failed header-safety validation.',
      { mutationOutcome: 'none' },
    );
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

async function getApplication({ token, fetchImpl, appId }) {
  return cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps/${encodeURIComponent(appId)}`,
  );
}

async function listPolicies({ token, fetchImpl, appId }) {
  const result = await cloudflareJson(
    { token, fetchImpl },
    'GET',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps/${encodeURIComponent(appId)}/policies?per_page=1000`,
  );
  return Array.isArray(result) ? result : [];
}

async function updateDestinations({
  token,
  fetchImpl,
  appId,
  destinations,
  expectedCurrentDestinations,
  expectedIdentityFingerprint,
  expectedPolicyFingerprint,
}) {
  const current = await getApplication({ token, fetchImpl, appId });
  const domain = clean(current?.domain);
  const type = clean(current?.type);
  if (!domain || type !== 'self_hosted') {
    throw errorWith(
      'split-source-update-shape-unsupported',
      'Destination mutation requires a provider-read self-hosted application with a stable domain and type.',
      { mutationOutcome: 'none', sourceApplicationId: appId },
    );
  }
  if (!sameDestinations(current?.destinations, expectedCurrentDestinations)
    || applicationIdentityFingerprint(current) !== expectedIdentityFingerprint) {
    throw errorWith(
      'split-source-drift-before-write',
      'The protected Access application changed after observation; refusing to overwrite newer provider state.',
      { mutationOutcome: 'none', sourceApplicationId: appId },
    );
  }
  const policies = await listPolicies({ token, fetchImpl, appId });
  if (policyFingerprint(policies) !== expectedPolicyFingerprint) {
    throw errorWith(
      'split-source-drift-before-write',
      'The protected Access policies changed after observation; refusing provider mutation.',
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
  const destinations = managedPublicUris(zone)
    .map((uri) => ({ type: 'public', uri }));
  return cloudflareJson(
    { token, fetchImpl },
    'POST',
    `/accounts/${FCR_CLOUDFLARE_ACCOUNT_ID}/access/apps`,
    {
      name: FCR_SPLIT_PUBLIC_ACCESS_APP_NAME,
      type: 'self_hosted',
      domain: `www.${zone}`,
      session_duration: '24h',
      destinations,
      policies: [{
        name: 'Bypass public FCR front door and version witness',
        decision: 'bypass',
        include: [{ everyone: {} }],
        precedence: 1,
      }],
    },
  );
}

async function deleteManagedApplication({ token, fetchImpl, application, zone }) {
  if (!isExactManagedPublicApplication(application, zone)) {
    throw errorWith(
      'split-rollback-managed-app-drift',
      'The receipt-bound public application drifted before deletion.',
      { mutationOutcome: 'performed' },
    );
  }
  const appId = clean(application?.id);
  const current = await getApplication({ token, fetchImpl, appId });
  if (!isExactManagedPublicApplication(current, zone)) {
    throw errorWith(
      'split-rollback-managed-app-drift',
      'The receipt-bound public application changed at the delete boundary.',
      { mutationOutcome: 'performed', managedApplicationId: appId },
    );
  }
  const policies = await listPolicies({ token, fetchImpl, appId });
  if (!hasExactEveryoneBypass(policies)) {
    throw errorWith(
      'split-rollback-managed-app-drift',
      'The receipt-bound public application policies changed at the delete boundary.',
      { mutationOutcome: 'performed', managedApplicationId: appId },
    );
  }
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
  const target = assertCanonicalZone(zone);
  if (clean(application?.name) !== FCR_SPLIT_PUBLIC_ACCESS_APP_NAME) return false;
  if (clean(application?.type).toLowerCase() !== 'self_hosted') return false;
  if (clean(application?.domain).toLowerCase() !== `www.${target}`) return false;
  const destinations = Array.isArray(application?.destinations) ? application.destinations : [];
  if (destinations.length !== 3 || destinations.some((destination) => destinationType(destination) !== 'public')) {
    return false;
  }
  const actual = destinations
    .map((destination) => normalizePublicUri(destination?.uri || destination?.hostname))
    .sort();
  const expected = managedPublicUris(target).map(normalizePublicUri).sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function exactManagedPublicApplications(applications, zone) {
  return applications.filter((application) => isExactManagedPublicApplication(application, zone));
}

function namedManagedPublicApplications(applications) {
  return applications.filter(
    (application) => clean(application?.name) === FCR_SPLIT_PUBLIC_ACCESS_APP_NAME,
  );
}

function hasExactEveryoneBypass(policies) {
  return Array.isArray(policies)
    && policies.length === 1
    && isEveryoneBypassPolicy(policies[0]);
}

function errorWith(classification, message, fields = {}) {
  const error = new Error(message);
  error.classification = classification;
  Object.assign(error, fields);
  return error;
}

async function persistCheckpoint(persistReceipt, receipt) {
  if (typeof persistReceipt !== 'function') {
    throw errorWith(
      'split-durable-receipt-required',
      'Provider mutation requires a durable split receipt writer.',
      { mutationOutcome: 'none' },
    );
  }
  try {
    await persistReceipt(structuredClone(receipt));
  } catch {
    throw errorWith(
      'split-durable-receipt-write-failed',
      'The durable split receipt could not be persisted; provider execution is stopped.',
      { mutationOutcome: receipt?.mutationOutcome === 'none' ? 'none' : 'unknown' },
    );
  }
}

async function readSourceState({ token, fetchImpl, sourceId, zone }) {
  const applications = await listApplications({ token, fetchImpl });
  const source = applications.find((application) => clean(application?.id) === sourceId) ?? null;
  const managed = exactManagedPublicApplications(applications, zone);
  const namedManaged = namedManagedPublicApplications(applications);
  return { applications, source, managed, namedManaged };
}

async function proveSourceIdentity({
  token,
  fetchImpl,
  source,
  sourceId,
  expectedIdentityFingerprint,
  expectedPolicyFingerprint,
}) {
  if (!source || applicationIdentityFingerprint(source) !== expectedIdentityFingerprint) return false;
  const policies = await listPolicies({ token, fetchImpl, appId: sourceId });
  return policyFingerprint(policies) === expectedPolicyFingerprint;
}

async function sourceMatches({
  token,
  fetchImpl,
  source,
  sourceId,
  expectedDestinations,
  expectedIdentityFingerprint,
  expectedPolicyFingerprint,
}) {
  return sameDestinations(source?.destinations, expectedDestinations)
    && await proveSourceIdentity({
      token,
      fetchImpl,
      source,
      sourceId,
      expectedIdentityFingerprint,
      expectedPolicyFingerprint,
    });
}

function checkpoint(seed, fields = {}) {
  return {
    ...seed,
    observedAt: new Date().toISOString(),
    ...fields,
  };
}

async function assertNoManagedCollisions({ applications, sourceId, zone }) {
  const named = namedManagedPublicApplications(applications)
    .filter((application) => clean(application?.id) !== sourceId);
  const collisions = managedDestinationCollisions(applications, { sourceId, zone });
  if (named.length > 0 || collisions.length > 0) {
    throw errorWith(
      'split-public-destination-collision',
      'A different Access application already overlaps the bounded public destination set.',
      { mutationOutcome: 'none', collisionCount: Math.max(named.length, collisions.length) },
    );
  }
}

export async function executeFcrPublicWorkerSplit({
  env = process.env,
  fetchImpl = fetch,
  zone = FCR_PUBLIC_ZONE,
  persistReceipt,
} = {}) {
  const canonicalZone = assertCanonicalZone(zone);
  assertCanonicalAccount(env);
  if (typeof persistReceipt !== 'function') {
    throw errorWith(
      'split-durable-receipt-required',
      'Provider mutation requires a durable split receipt writer before any provider request.',
      { mutationOutcome: 'none' },
    );
  }
  const token = adminToken(env);
  const applications = await listApplications({ token, fetchImpl });
  const matching = wholeSitePublicApplications(applications, canonicalZone);
  if (matching.length !== 1) {
    throw errorWith(
      'split-topology-not-unique',
      'Split repair requires exactly one Access application with a whole-site FCR public destination.',
      { mutationOutcome: 'none' },
    );
  }

  const source = matching[0];
  if (clean(source?.name) === FCR_SPLIT_PUBLIC_ACCESS_APP_NAME) {
    throw errorWith(
      'split-managed-app-not-eligible',
      'The bounded public application already owns the whole-site destination; split mutation is not applicable.',
      { mutationOutcome: 'none' },
    );
  }

  const topology = classifyFcrPublicWorkerSplit(source, canonicalZone);
  if (!topology.eligible) {
    throw errorWith(
      'split-topology-not-eligible',
      'Split repair is limited to exactly one whole-site public destination plus exactly one Worker destination.',
      { mutationOutcome: 'none' },
    );
  }

  const sourceId = clean(source?.id);
  if (!sourceId) {
    throw errorWith(
      'split-source-id-missing',
      'Split source application has no stable provider ID.',
      { mutationOutcome: 'none' },
    );
  }
  await assertNoManagedCollisions({ applications, sourceId, zone: canonicalZone });

  const policiesBefore = await listPolicies({ token, fetchImpl, appId: sourceId });
  if (policiesBefore.some(isEveryoneBypassPolicy)) {
    throw errorWith(
      'split-source-already-everyone-bypass',
      'The mixed Access application already contains an Everyone bypass; split repair refuses to reinterpret it.',
      { mutationOutcome: 'none' },
    );
  }

  const originalDestinations = structuredClone(source.destinations);
  const workerDestination = structuredClone(topology.workerDestination);
  const sourceIdentityBefore = applicationIdentityFingerprint(source);
  const sourcePolicyBefore = policyFingerprint(policiesBefore);
  const seed = {
    schemaVersion: 2,
    scope: 'fcr-access-public-worker-split',
    state: 'prepared',
    phase: 'prepared',
    mutationOutcome: 'none',
    mutationPerformed: false,
    rollbackPerformed: false,
    zone: canonicalZone,
    sourceApplicationId: sourceId,
    managedApplicationId: null,
    originalDestinations,
    workerDestination,
    publicDestinations: managedPublicUris(canonicalZone),
    sourceIdentityFingerprint: sourceIdentityBefore,
    sourcePolicyFingerprint: sourcePolicyBefore,
    publicCreateAttempted: false,
    splitApplied: false,
  };

  await persistCheckpoint(persistReceipt, checkpoint(seed));
  const sourceUpdatePending = checkpoint(seed, {
    state: 'source-update-pending',
    phase: 'source-update-pending',
    mutationOutcome: 'unknown',
  });
  await persistCheckpoint(persistReceipt, sourceUpdatePending);

  try {
    await updateDestinations({
      token,
      fetchImpl,
      appId: sourceId,
      destinations: [workerDestination],
      expectedCurrentDestinations: originalDestinations,
      expectedIdentityFingerprint: sourceIdentityBefore,
      expectedPolicyFingerprint: sourcePolicyBefore,
    });
  } catch (writeError) {
    let readback;
    try {
      readback = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
    } catch {
      const unknown = checkpoint(seed, {
        state: 'reconcile-required',
        phase: 'source-update-unknown',
        mutationOutcome: 'unknown',
        classification: writeError?.classification || 'split-source-update-reconcile-required',
      });
      await persistCheckpoint(persistReceipt, unknown);
      throw errorWith(
        'split-source-update-reconcile-required',
        'The Worker-only destination update has an unknown provider outcome; no further write is allowed.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }

    if (await sourceMatches({
      token,
      fetchImpl,
      source: readback.source,
      sourceId,
      expectedDestinations: [workerDestination],
      expectedIdentityFingerprint: sourceIdentityBefore,
      expectedPolicyFingerprint: sourcePolicyBefore,
    })) {
      await persistCheckpoint(persistReceipt, checkpoint(seed, {
        state: 'source-narrowed',
        phase: 'source-narrowed',
        mutationOutcome: 'performed',
        mutationPerformed: true,
      }));
    } else if (await sourceMatches({
      token,
      fetchImpl,
      source: readback.source,
      sourceId,
      expectedDestinations: originalDestinations,
      expectedIdentityFingerprint: sourceIdentityBefore,
      expectedPolicyFingerprint: sourcePolicyBefore,
    })) {
      const notPerformed = checkpoint(seed, {
        state: 'failed',
        phase: 'source-update-not-performed',
        mutationOutcome: 'none',
        classification: writeError?.classification || 'split-source-update-not-performed',
      });
      await persistCheckpoint(persistReceipt, notPerformed);
      throw errorWith(
        writeError?.classification || 'split-source-update-not-performed',
        'Provider readback proves the Worker-only destination update did not occur.',
        { mutationOutcome: 'none', sourceApplicationId: sourceId },
      );
    } else {
      const unknown = checkpoint(seed, {
        state: 'reconcile-required',
        phase: 'source-update-unknown',
        mutationOutcome: 'unknown',
        classification: 'split-source-update-reconcile-required',
      });
      await persistCheckpoint(persistReceipt, unknown);
      throw errorWith(
        'split-source-update-reconcile-required',
        'Provider readback cannot prove the Worker-only destination outcome.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }
  }

  const afterNarrow = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
  if (!(await sourceMatches({
    token,
    fetchImpl,
    source: afterNarrow.source,
    sourceId,
    expectedDestinations: [workerDestination],
    expectedIdentityFingerprint: sourceIdentityBefore,
    expectedPolicyFingerprint: sourcePolicyBefore,
  }))) {
    const unknown = checkpoint(seed, {
      state: 'reconcile-required',
      phase: 'source-narrowing-unverified',
      mutationOutcome: 'unknown',
      mutationPerformed: true,
      classification: 'split-source-narrowing-unverified',
    });
    await persistCheckpoint(persistReceipt, unknown);
    throw errorWith(
      'split-source-narrowing-unverified',
      'Worker-only destination state was not independently verified exactly.',
      { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
    );
  }

  const narrowed = checkpoint(seed, {
    state: 'source-narrowed',
    phase: 'source-narrowed',
    mutationOutcome: 'performed',
    mutationPerformed: true,
  });
  await persistCheckpoint(persistReceipt, narrowed);

  const beforeCreate = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
  if (!(await sourceMatches({
    token,
    fetchImpl,
    source: beforeCreate.source,
    sourceId,
    expectedDestinations: [workerDestination],
    expectedIdentityFingerprint: sourceIdentityBefore,
    expectedPolicyFingerprint: sourcePolicyBefore,
  }))) {
    const blocked = checkpoint(narrowed, {
      state: 'reconcile-required',
      phase: 'source-drift-before-public-create',
      classification: 'split-source-identity-drift',
    });
    await persistCheckpoint(persistReceipt, blocked);
    throw errorWith(
      'split-source-identity-drift',
      'The protected Access application drifted before public-app creation.',
      { mutationOutcome: 'performed', sourceApplicationId: sourceId },
    );
  }
  try {
    await assertNoManagedCollisions({
      applications: beforeCreate.applications,
      sourceId,
      zone: canonicalZone,
    });
  } catch (error) {
    const blocked = checkpoint(narrowed, {
      state: 'reconcile-required',
      phase: 'public-collision-before-create',
      classification: error.classification,
    });
    await persistCheckpoint(persistReceipt, blocked);
    error.mutationOutcome = 'performed';
    error.sourceApplicationId = sourceId;
    throw error;
  }

  const applicationIdsBeforeCreate = new Set(
    beforeCreate.applications.map((application) => clean(application?.id)).filter(Boolean),
  );
  const createPending = checkpoint(narrowed, {
    state: 'public-create-pending',
    phase: 'public-create-pending',
    publicCreateAttempted: true,
  });
  await persistCheckpoint(persistReceipt, createPending);

  let managedApp = null;
  try {
    managedApp = await createManagedPublicApplication({ token, fetchImpl, zone: canonicalZone });
    const managedId = clean(managedApp?.id);
    if (!managedId || !isExactManagedPublicApplication(managedApp, canonicalZone)) {
      const unknown = checkpoint(createPending, {
        state: 'reconcile-required',
        phase: 'public-create-return-shape-unknown',
        mutationOutcome: 'unknown',
        managedApplicationId: managedId || null,
        classification: 'split-public-create-reconcile-required',
      });
      await persistCheckpoint(persistReceipt, unknown);
      throw errorWith(
        'split-public-create-reconcile-required',
        'The public-app create returned an unprovable identity or shape.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId, managedApplicationId: managedId || null },
      );
    }
    await persistCheckpoint(persistReceipt, checkpoint(createPending, {
      state: 'public-created-pending-proof',
      phase: 'public-created-pending-proof',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      managedApplicationId: managedId,
    }));
  } catch (createError) {
    if (createError?.classification === 'split-public-create-reconcile-required') throw createError;
    let readback;
    try {
      readback = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
    } catch {
      const unknown = checkpoint(createPending, {
        state: 'reconcile-required',
        phase: 'public-create-outcome-unknown',
        mutationOutcome: 'unknown',
        classification: 'split-public-create-reconcile-required',
      });
      await persistCheckpoint(persistReceipt, unknown);
      throw errorWith(
        'split-public-create-reconcile-required',
        'The public-app create has an unknown provider outcome; no compensating write is allowed.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }

    const newlyObserved = readback.applications.filter((application) => {
      const id = clean(application?.id);
      return id && !applicationIdsBeforeCreate.has(id);
    });
    const candidates = newlyObserved.filter((application) =>
      isExactManagedPublicApplication(application, canonicalZone));
    if (candidates.length === 1
      && readback.managed.length === 1
      && readback.namedManaged.length === 1
      && clean(candidates[0]?.id)) {
      [managedApp] = candidates;
      await persistCheckpoint(persistReceipt, checkpoint(createPending, {
        state: 'public-created-pending-proof',
        phase: 'public-created-pending-proof',
        mutationOutcome: 'performed',
        mutationPerformed: true,
        managedApplicationId: clean(managedApp.id),
      }));
    } else {
      const unknown = checkpoint(createPending, {
        state: 'reconcile-required',
        phase: 'public-create-outcome-unknown',
        mutationOutcome: 'unknown',
        classification: 'split-public-create-reconcile-required',
      });
      await persistCheckpoint(persistReceipt, unknown);
      throw errorWith(
        'split-public-create-reconcile-required',
        'The public-app create outcome cannot be proven from provider identity; no restore or retry is allowed.',
        { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
      );
    }
  }

  const managedId = clean(managedApp?.id);
  const managedPolicies = await listPolicies({ token, fetchImpl, appId: managedId });
  if (!hasExactEveryoneBypass(managedPolicies)) {
    const blocked = checkpoint(createPending, {
      state: 'reconcile-required',
      phase: 'public-policy-unverified',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      managedApplicationId: managedId,
      classification: 'split-public-bypass-mismatch',
    });
    await persistCheckpoint(persistReceipt, blocked);
    throw errorWith(
      'split-public-bypass-mismatch',
      'The managed public application does not have exactly one Everyone bypass policy.',
      { mutationOutcome: 'performed', sourceApplicationId: sourceId, managedApplicationId: managedId },
    );
  }

  const finalState = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
  const sourceFinalMatches = await sourceMatches({
    token,
    fetchImpl,
    source: finalState.source,
    sourceId,
    expectedDestinations: [workerDestination],
    expectedIdentityFingerprint: sourceIdentityBefore,
    expectedPolicyFingerprint: sourcePolicyBefore,
  });
  const foreignCollisions = managedDestinationCollisions(finalState.applications, {
    sourceId,
    zone: canonicalZone,
  }).filter((collision) => collision.applicationId !== managedId);
  if (!sourceFinalMatches
    || finalState.managed.length !== 1
    || finalState.namedManaged.length !== 1
    || clean(finalState.managed[0]?.id) !== managedId
    || foreignCollisions.length > 0) {
    const blocked = checkpoint(createPending, {
      state: 'reconcile-required',
      phase: 'final-readback-mismatch',
      mutationOutcome: 'performed',
      mutationPerformed: true,
      managedApplicationId: managedId,
      classification: 'split-final-readback-mismatch',
    });
    await persistCheckpoint(persistReceipt, blocked);
    throw errorWith(
      'split-final-readback-mismatch',
      'Final provider readback did not preserve the exact protected Worker and one exact public application.',
      { mutationOutcome: 'performed', sourceApplicationId: sourceId, managedApplicationId: managedId },
    );
  }

  const success = checkpoint(seed, {
    state: 'mutated-needs-browser-proof',
    phase: 'split-applied',
    mutationOutcome: 'performed',
    mutationPerformed: true,
    managedApplicationId: managedId,
    publicCreateAttempted: true,
    splitApplied: true,
    nextAction: 'run anonymous public-front-door, founder-containment, Pages-to-Worker health, exact-version, and protected-direct-API proofs',
  });
  await persistCheckpoint(persistReceipt, success);
  return success;
}

export async function rollbackFcrPublicWorkerSplit({
  receipt,
  env = process.env,
  fetchImpl = fetch,
  persistReceipt,
} = {}) {
  const canonicalZone = assertCanonicalZone(receipt?.zone ?? FCR_PUBLIC_ZONE);
  assertCanonicalAccount(env);
  if (typeof persistReceipt !== 'function') {
    throw errorWith(
      'split-durable-receipt-required',
      'Rollback requires a durable receipt writer before any provider request.',
      { mutationOutcome: 'none' },
    );
  }
  if (receipt?.scope !== 'fcr-access-public-worker-split'
    || !['performed', 'unknown'].includes(receipt?.mutationOutcome)) {
    throw errorWith('split-rollback-receipt-invalid', 'Rollback requires an exact split receipt with possible provider mutation.');
  }

  const sourceId = clean(receipt.sourceApplicationId);
  const managedId = clean(receipt.managedApplicationId);
  const originalDestinations = Array.isArray(receipt.originalDestinations)
    ? receipt.originalDestinations
    : [];
  const workerDestination = receipt?.workerDestination && typeof receipt.workerDestination === 'object'
    ? structuredClone(receipt.workerDestination)
    : null;
  if (!sourceId || originalDestinations.length !== 2 || !workerDestination
    || !classifyFcrPublicWorkerSplit({ destinations: originalDestinations }, canonicalZone).eligible) {
    throw errorWith(
      'split-rollback-receipt-invalid',
      'Rollback receipt is missing exact source, original destinations, or Worker destination evidence.',
    );
  }
  if (receipt.publicCreateAttempted === true && !managedId) {
    throw errorWith(
      'split-rollback-managed-identity-unknown',
      'Public-app creation was attempted but no provider-bound managed application ID is proven; automatic rollback is unsafe.',
      { mutationOutcome: 'unknown' },
    );
  }

  const token = adminToken(env);
  let state = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
  const sourceAlreadyRestored = await sourceMatches({
    token,
    fetchImpl,
    source: state.source,
    sourceId,
    expectedDestinations: originalDestinations,
    expectedIdentityFingerprint: receipt.sourceIdentityFingerprint,
    expectedPolicyFingerprint: receipt.sourcePolicyFingerprint,
  });
  if (sourceAlreadyRestored) {
    const remainingNamed = state.namedManaged;
    const remainingCollisions = managedDestinationCollisions(state.applications, {
      sourceId,
      zone: canonicalZone,
    });
    if (remainingNamed.length === 0 && remainingCollisions.length === 0) {
      const rolledBack = checkpoint(receipt, {
        state: 'rolled-back',
        phase: 'rolled-back',
        mutationOutcome: 'performed',
        rollbackPerformed: true,
        splitApplied: false,
        nextAction: 're-inspect provider topology before any future repair attempt',
      });
      await persistCheckpoint(persistReceipt, rolledBack);
      return rolledBack;
    }
  }
  if (!(await sourceMatches({
    token,
    fetchImpl,
    source: state.source,
    sourceId,
    expectedDestinations: [workerDestination],
    expectedIdentityFingerprint: receipt.sourceIdentityFingerprint,
    expectedPolicyFingerprint: receipt.sourcePolicyFingerprint,
  }))) {
    throw errorWith(
      'split-rollback-source-drift',
      'The protected Worker application drifted after the split; rollback refuses any provider write.',
      { mutationOutcome: 'performed' },
    );
  }

  if (managedId) {
    const managedById = state.applications.filter((application) => clean(application?.id) === managedId);
    const named = state.namedManaged;
    const exact = state.managed;
    const foreignCollisions = managedDestinationCollisions(state.applications, {
      sourceId,
      zone: canonicalZone,
    }).filter((collision) => collision.applicationId !== managedId);
    const deleteMayHaveCompleted = receipt?.rollbackPublicDeleteAttempted === true;
    if (managedById.length === 0 && deleteMayHaveCompleted) {
      if (named.length > 0 || exact.length > 0 || foreignCollisions.length > 0) {
        throw errorWith(
          'split-rollback-managed-app-drift',
          'The receipt-bound public application is absent but replacement public ownership exists.',
          { mutationOutcome: 'performed', managedApplicationId: managedId },
        );
      }
    } else {
      if (managedById.length !== 1
        || !isExactManagedPublicApplication(managedById[0], canonicalZone)
        || named.length !== 1
        || exact.length !== 1
        || clean(exact[0]?.id) !== managedId
        || foreignCollisions.length > 0) {
        throw errorWith(
          'split-rollback-managed-app-drift',
          'Managed public ownership drifted; rollback refuses deletion or source restoration.',
          { mutationOutcome: 'performed', managedApplicationId: managedId },
        );
      }
      const managedPolicies = await listPolicies({ token, fetchImpl, appId: managedId });
      if (!hasExactEveryoneBypass(managedPolicies)) {
        throw errorWith(
          'split-rollback-managed-app-drift',
          'Managed public policies drifted; rollback refuses deletion.',
          { mutationOutcome: 'performed', managedApplicationId: managedId },
        );
      }

      const sourceAtDelete = await getApplication({ token, fetchImpl, appId: sourceId });
      if (!(await sourceMatches({
        token,
        fetchImpl,
        source: sourceAtDelete,
        sourceId,
        expectedDestinations: [workerDestination],
        expectedIdentityFingerprint: receipt.sourceIdentityFingerprint,
        expectedPolicyFingerprint: receipt.sourcePolicyFingerprint,
      }))) {
        throw errorWith(
          'split-rollback-source-drift',
          'The protected Worker drifted at the delete boundary; public access is left untouched.',
          { mutationOutcome: 'performed' },
        );
      }

      const deletePending = checkpoint(receipt, {
        state: 'rollback-public-delete-pending',
        phase: 'rollback-public-delete-pending',
        rollbackPublicDeleteAttempted: true,
      });
      await persistCheckpoint(persistReceipt, deletePending);

      try {
        await deleteManagedApplication({ token, fetchImpl, application: managedById[0], zone: canonicalZone });
      } catch (deleteError) {
        let readback;
        try {
          readback = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
        } catch {
          throw errorWith(
            'split-rollback-reconcile-required',
            'Public-app deletion has an unknown provider outcome; source restoration is blocked.',
            { mutationOutcome: 'unknown' },
          );
        }
        if (readback.applications.some((application) => clean(application?.id) === managedId)) {
          throw errorWith(
            deleteError?.classification || 'split-rollback-public-delete-not-performed',
            'Provider readback proves the receipt-bound public application still exists; source restoration is blocked.',
            { mutationOutcome: 'performed', managedApplicationId: managedId },
          );
        }
      }
    }

    await persistCheckpoint(persistReceipt, checkpoint(receipt, {
      state: 'rollback-public-removed',
      phase: 'rollback-public-removed',
      rollbackPerformed: false,
      splitApplied: false,
    }));
  }

  state = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
  const remainingNamed = state.namedManaged;
  const remainingCollisions = managedDestinationCollisions(state.applications, {
    sourceId,
    zone: canonicalZone,
  });
  if (remainingNamed.length > 0 || remainingCollisions.length > 0) {
    throw errorWith(
      'split-rollback-public-replacement-detected',
      'A public Access application now overlaps the bounded split destinations; source restoration is blocked.',
      { mutationOutcome: 'performed' },
    );
  }
  if (!(await sourceMatches({
    token,
    fetchImpl,
    source: state.source,
    sourceId,
    expectedDestinations: [workerDestination],
    expectedIdentityFingerprint: receipt.sourceIdentityFingerprint,
    expectedPolicyFingerprint: receipt.sourcePolicyFingerprint,
  }))) {
    throw errorWith(
      'split-rollback-source-drift',
      'The protected Worker application drifted before source restoration.',
      { mutationOutcome: 'performed' },
    );
  }

  const restorePending = checkpoint(receipt, {
    state: 'rollback-source-restore-pending',
    phase: 'rollback-source-restore-pending',
    mutationOutcome: 'unknown',
    rollbackSourceRestoreAttempted: true,
  });
  await persistCheckpoint(persistReceipt, restorePending);

  try {
    await updateDestinations({
      token,
      fetchImpl,
      appId: sourceId,
      destinations: originalDestinations,
      expectedCurrentDestinations: [workerDestination],
      expectedIdentityFingerprint: receipt.sourceIdentityFingerprint,
      expectedPolicyFingerprint: receipt.sourcePolicyFingerprint,
    });
  } catch {
    // Never infer a failed response means no write. Reconcile below.
  }

  const restoredState = await readSourceState({ token, fetchImpl, sourceId, zone: canonicalZone });
  const restored = await sourceMatches({
    token,
    fetchImpl,
    source: restoredState.source,
    sourceId,
    expectedDestinations: originalDestinations,
    expectedIdentityFingerprint: receipt.sourceIdentityFingerprint,
    expectedPolicyFingerprint: receipt.sourcePolicyFingerprint,
  });
  if (!restored) {
    const unknown = checkpoint(receipt, {
      state: 'reconcile-required',
      phase: 'rollback-source-restore-unknown',
      mutationOutcome: 'unknown',
      rollbackPerformed: false,
      splitApplied: false,
      classification: 'split-rollback-reconcile-required',
    });
    await persistCheckpoint(persistReceipt, unknown);
    throw errorWith(
      'split-rollback-reconcile-required',
      'Provider readback did not prove restoration of the exact original protected-source destinations.',
      { mutationOutcome: 'unknown', sourceApplicationId: sourceId },
    );
  }

  const rolledBack = checkpoint(receipt, {
    state: 'rolled-back',
    phase: 'rolled-back',
    mutationOutcome: 'performed',
    rollbackPerformed: true,
    splitApplied: false,
    nextAction: 're-inspect provider topology before any future repair attempt',
  });
  await persistCheckpoint(persistReceipt, rolledBack);
  return rolledBack;
}
