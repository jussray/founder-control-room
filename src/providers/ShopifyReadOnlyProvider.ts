import {
  reconcileProviderObservation,
  type ProviderChildDeclaration,
  type ProviderChildObservation,
  type ProviderObservationCompleteness,
  type ProviderReconciliationResult,
} from '../lib/providerObservation.js';

export const FOUNDER_CONTROL_ROOM_PROJECT_SLUG = 'founder-control-room';
export const FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN = 'vercel-store-93a908b0-wcrkkq76.myshopify.com';
export const FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN = 'foundercontrolroom.org';
export const DEFAULT_SHOPIFY_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;

export interface ShopifyInstalledAppSnapshot {
  installationId?: string | null;
  appId?: string | null;
  title?: string | null;
  handle?: string | null;
  developerName?: string | null;
  scopes?: readonly string[] | null;
}

export interface ShopifyInstalledAppInventorySnapshot {
  myshopifyDomain?: string | null;
  primaryDomain?: string | null;
  observedAt?: string | null;
  hasNextPage?: boolean | null;
  apps?: readonly ShopifyInstalledAppSnapshot[] | null;
}

export interface ShopifyReadOnlyPreflightOptions {
  now?: Date;
  maxSnapshotAgeMs?: number;
}

export interface ShopifyReadOnlyPreflightResult {
  status: 'ready' | 'blocked';
  mode: 'read-only';
  expectedShopifyDomain: string;
  observedShopifyDomain: string;
  expectedPrimaryDomain: string;
  observedPrimaryDomain: string;
  observedAt: string | null;
  snapshotAgeMs: number | null;
  inventoryComplete: boolean;
  observedAppCount: number;
  mutationAllowed: false;
  persistenceAllowed: false;
  allowedOperations: readonly ['inspect_installed_apps', 'reconcile_declared_scopes'];
  observations: readonly ProviderChildObservation[];
  errors: readonly string[];
  warnings: readonly string[];
}

export interface ShopifyAppReconciliation {
  installationId: string;
  appId: string;
  title: string | null;
  handle: string | null;
  developerName: string | null;
  reconciliation: ProviderReconciliationResult;
}

export interface ShopifyInventoryReconciliationResult {
  preflight: ShopifyReadOnlyPreflightResult;
  parentConnectionDeclared: boolean;
  apps: readonly ShopifyAppReconciliation[];
}

function normalizedText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedDomain(value: string | null | undefined): string {
  const raw = normalizedText(value).toLowerCase();
  if (!raw) return '';

  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/\.$/, '');
  } catch {
    return '';
  }
}

function parsedTimestamp(value: string | null | undefined): number | null {
  const raw = normalizedText(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function canonicalScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0))].sort();
}

function normalizeObservation(
  app: ShopifyInstalledAppSnapshot,
  providerAccountId: string,
  observedAt: string,
  completeness: ProviderObservationCompleteness,
): ProviderChildObservation | null {
  const installationId = normalizedText(app.installationId);
  const appId = normalizedText(app.appId);
  if (!installationId || !appId || !Array.isArray(app.scopes)) return null;

  return {
    projectSlug: FOUNDER_CONTROL_ROOM_PROJECT_SLUG,
    providerType: 'shopify',
    providerAccountId,
    installationId,
    appId,
    handle: normalizedText(app.handle) || null,
    developerName: normalizedText(app.developerName) || null,
    scopes: canonicalScopes(app.scopes),
    observedAt,
    completeness,
  };
}

export function preflightFounderShopifyInventory(
  snapshot: ShopifyInstalledAppInventorySnapshot,
  options: ShopifyReadOnlyPreflightOptions = {},
): ShopifyReadOnlyPreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [
    'Shopify installed-app observation is evidence only. Installation does not grant Founder Control Room authority.',
    'Provider inventory is intentionally not persisted as a local current-state claim.',
  ];
  const observedShopifyDomain = normalizedDomain(snapshot.myshopifyDomain);
  const observedPrimaryDomain = normalizedDomain(snapshot.primaryDomain);
  const nowMs = options.now?.getTime() ?? Date.now();
  const requestedMaxAgeMs = options.maxSnapshotAgeMs ?? DEFAULT_SHOPIFY_SNAPSHOT_MAX_AGE_MS;
  const maxSnapshotAgeMs = Number.isFinite(requestedMaxAgeMs) && requestedMaxAgeMs > 0
    ? requestedMaxAgeMs
    : DEFAULT_SHOPIFY_SNAPSHOT_MAX_AGE_MS;
  const observedAtMs = parsedTimestamp(snapshot.observedAt);
  const observedAt = observedAtMs === null ? null : new Date(observedAtMs).toISOString();
  const snapshotAgeMs = observedAtMs === null ? null : nowMs - observedAtMs;
  const inventoryComplete = snapshot.hasNextPage === false;
  const apps = Array.isArray(snapshot.apps) ? snapshot.apps : [];
  const storeIdentityValid = observedShopifyDomain === FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN
    && observedPrimaryDomain === FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN;

  if (observedShopifyDomain !== FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN) {
    errors.push(
      `Shopify account identity must be exactly ${FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN}; observed ${observedShopifyDomain || 'missing'}.`,
    );
  }

  if (observedPrimaryDomain !== FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN) {
    errors.push(
      `Shopify primary domain must be exactly ${FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN}; observed ${observedPrimaryDomain || 'missing'}.`,
    );
  }

  if (observedAtMs === null) {
    errors.push('Shopify installed-app inventory must include a valid observedAt timestamp.');
  } else if (snapshotAgeMs !== null && snapshotAgeMs < 0) {
    errors.push('Shopify installed-app inventory observedAt is in the future and cannot establish current truth.');
  } else if (snapshotAgeMs !== null && snapshotAgeMs > maxSnapshotAgeMs) {
    errors.push(
      `Shopify installed-app inventory is stale by ${snapshotAgeMs}ms; maximum allowed age is ${maxSnapshotAgeMs}ms.`,
    );
  }

  if (!Array.isArray(snapshot.apps)) {
    errors.push('Shopify installed-app inventory must include an apps array.');
  }
  if (!inventoryComplete) {
    errors.push('Shopify installed-app inventory must prove pagination is complete before it can establish current truth.');
  }

  const installationIds = new Set<string>();
  const appIds = new Set<string>();
  let appStructureValid = Array.isArray(snapshot.apps);
  for (const [index, app] of apps.entries()) {
    const installationId = normalizedText(app.installationId);
    const appId = normalizedText(app.appId);

    if (!installationId) {
      appStructureValid = false;
      errors.push(`Shopify app at index ${index} is missing installationId.`);
    }
    if (!appId) {
      appStructureValid = false;
      errors.push(`Shopify app at index ${index} is missing appId.`);
    }
    if (!Array.isArray(app.scopes)) {
      appStructureValid = false;
      errors.push(`Shopify app at index ${index} is missing its scope inventory.`);
    }

    if (installationId) {
      if (installationIds.has(installationId)) {
        appStructureValid = false;
        errors.push(`Shopify installed-app inventory repeats installationId ${installationId}.`);
      }
      installationIds.add(installationId);
    }

    if (appId) {
      if (appIds.has(appId)) {
        warnings.push(
          `Shopify installed-app inventory repeats appId ${appId}; installation identity remains the non-transferable authority boundary.`,
        );
      }
      appIds.add(appId);
    }
  }

  const structurallyComplete = storeIdentityValid && inventoryComplete && appStructureValid;
  const completeness: ProviderObservationCompleteness = structurallyComplete ? 'COMPLETE' : 'UNKNOWN';
  const normalizedObservedAt = observedAt ?? normalizedText(snapshot.observedAt);
  const observations = apps
    .map((app) => normalizeObservation(
      app,
      observedShopifyDomain,
      normalizedObservedAt,
      completeness,
    ))
    .filter((item): item is ProviderChildObservation => item !== null);

  return {
    status: errors.length === 0 ? 'ready' : 'blocked',
    mode: 'read-only',
    expectedShopifyDomain: FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN,
    observedShopifyDomain,
    expectedPrimaryDomain: FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN,
    observedPrimaryDomain,
    observedAt,
    snapshotAgeMs,
    inventoryComplete,
    observedAppCount: observations.length,
    mutationAllowed: false,
    persistenceAllowed: false,
    allowedOperations: ['inspect_installed_apps', 'reconcile_declared_scopes'],
    observations,
    errors,
    warnings,
  };
}

function declarationForObservation(
  observation: ProviderChildObservation,
  declarations: readonly ProviderChildDeclaration[],
): ProviderChildDeclaration | null {
  const sameBoundary = declarations.filter(
    (declaration) =>
      normalizedText(declaration.projectSlug) === observation.projectSlug
      && normalizedText(declaration.providerType) === observation.providerType
      && normalizedDomain(declaration.providerAccountId) === observation.providerAccountId,
  );

  const exactInstallation = sameBoundary.find(
    (declaration) => normalizedText(declaration.installationId) === observation.installationId,
  );
  if (exactInstallation) return exactInstallation;

  const appId = normalizedText(observation.appId);
  if (!appId) return null;

  const sameAppId = sameBoundary.filter((declaration) => normalizedText(declaration.appId) === appId);
  return sameAppId.length === 1 ? sameAppId[0] : null;
}

export function reconcileFounderShopifyInventory(
  snapshot: ShopifyInstalledAppInventorySnapshot,
  declarations: readonly ProviderChildDeclaration[],
  parentConnectionDeclared: boolean,
  options: ShopifyReadOnlyPreflightOptions = {},
): ShopifyInventoryReconciliationResult {
  const preflight = preflightFounderShopifyInventory(snapshot, options);
  const now = (options.now ?? new Date()).toISOString();
  const requestedMaxAgeMs = options.maxSnapshotAgeMs ?? DEFAULT_SHOPIFY_SNAPSHOT_MAX_AGE_MS;
  const maxAgeMs = Number.isFinite(requestedMaxAgeMs) && requestedMaxAgeMs > 0
    ? requestedMaxAgeMs
    : DEFAULT_SHOPIFY_SNAPSHOT_MAX_AGE_MS;

  const apps = preflight.observations.map((observation) => {
    const declaration = parentConnectionDeclared
      ? declarationForObservation(observation, declarations)
      : null;
    const reconciliation = reconcileProviderObservation({
      observation,
      declaration,
      now,
      maxAgeMs,
    });
    const source = (snapshot.apps ?? []).find(
      (app) => normalizedText(app.installationId) === observation.installationId,
    );

    return {
      installationId: observation.installationId,
      appId: normalizedText(observation.appId),
      title: normalizedText(source?.title) || null,
      handle: normalizedText(observation.handle) || null,
      developerName: normalizedText(observation.developerName) || null,
      reconciliation,
    };
  });

  return {
    preflight,
    parentConnectionDeclared,
    apps,
  };
}
