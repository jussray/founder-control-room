export type ProviderObservationCompleteness = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';

export type ProviderReconciliationState =
  | 'CURRENT'
  | 'UNDECLARED'
  | 'SCOPE_DRIFT'
  | 'IDENTITY_DRIFT'
  | 'STALE'
  | 'UNKNOWN';

export type ProviderReconciliationReason =
  | 'OBSERVATION_MISSING'
  | 'OBSERVATION_INCOMPLETE'
  | 'INVALID_FRESHNESS_WINDOW'
  | 'INVALID_NOW'
  | 'INVALID_OBSERVED_AT'
  | 'OBSERVATION_FROM_FUTURE'
  | 'OBSERVATION_STALE'
  | 'OBSERVATION_IDENTITY_INVALID'
  | 'DECLARATION_MISSING'
  | 'DECLARATION_INVALID'
  | 'IDENTITY_DRIFT'
  | 'SCOPE_ADDED'
  | 'SCOPE_MISSING'
  | 'MATCHED_CURRENT';

export interface ProviderChildObservation {
  projectSlug: string;
  providerType: string;
  providerAccountId: string;
  installationId: string;
  appId?: string | null;
  handle?: string | null;
  developerName?: string | null;
  scopes: readonly string[];
  observedAt: string;
  completeness: ProviderObservationCompleteness;
}

export interface ProviderChildDeclaration {
  projectSlug: string;
  providerType: string;
  providerAccountId: string;
  installationId: string;
  appId?: string | null;
  handle?: string | null;
  developerName?: string | null;
  approvedScopes: readonly string[];
  approvalRef: string;
}

export interface ProviderReconciliationInput {
  observation: ProviderChildObservation | null;
  declaration: ProviderChildDeclaration | null;
  now: string;
  maxAgeMs: number;
}

export interface ProviderReconciliationResult {
  state: ProviderReconciliationState;
  /** Observation and reconciliation are evidence only. They never grant execution authority. */
  authorityGranted: false;
  reasons: readonly ProviderReconciliationReason[];
  identityMismatches: readonly string[];
  observedScopes: readonly string[];
  approvedScopes: readonly string[];
  addedScopes: readonly string[];
  missingScopes: readonly string[];
  observedAt: string | null;
}

function normalizedIdentityValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0))].sort();
}

function result(
  state: ProviderReconciliationState,
  reasons: ProviderReconciliationReason[],
  observation: ProviderChildObservation | null,
  declaration: ProviderChildDeclaration | null,
  extras: Partial<Pick<ProviderReconciliationResult, 'identityMismatches' | 'addedScopes' | 'missingScopes'>> = {},
): ProviderReconciliationResult {
  return {
    state,
    authorityGranted: false,
    reasons,
    identityMismatches: extras.identityMismatches ?? [],
    observedScopes: canonicalScopes(observation?.scopes ?? []),
    approvedScopes: canonicalScopes(declaration?.approvedScopes ?? []),
    addedScopes: extras.addedScopes ?? [],
    missingScopes: extras.missingScopes ?? [],
    observedAt: observation?.observedAt ?? null,
  };
}

function requiredObservationIdentityIsValid(observation: ProviderChildObservation): boolean {
  return [
    observation.projectSlug,
    observation.providerType,
    observation.providerAccountId,
    observation.installationId,
  ].every((value) => normalizedIdentityValue(value) !== null);
}

function requiredDeclarationIdentityIsValid(declaration: ProviderChildDeclaration): boolean {
  return [
    declaration.projectSlug,
    declaration.providerType,
    declaration.providerAccountId,
    declaration.installationId,
    declaration.approvalRef,
  ].every((value) => normalizedIdentityValue(value) !== null);
}

function identityMismatches(
  observation: ProviderChildObservation,
  declaration: ProviderChildDeclaration,
): string[] {
  const mismatches: string[] = [];
  const requiredFields = [
    ['projectSlug', observation.projectSlug, declaration.projectSlug],
    ['providerType', observation.providerType, declaration.providerType],
    ['providerAccountId', observation.providerAccountId, declaration.providerAccountId],
    ['installationId', observation.installationId, declaration.installationId],
  ] as const;

  for (const [field, observed, declared] of requiredFields) {
    if (normalizedIdentityValue(observed) !== normalizedIdentityValue(declared)) mismatches.push(field);
  }

  const optionalFields = [
    ['appId', observation.appId, declaration.appId],
    ['handle', observation.handle, declaration.handle],
    ['developerName', observation.developerName, declaration.developerName],
  ] as const;

  for (const [field, observed, declared] of optionalFields) {
    const expected = normalizedIdentityValue(declared);
    if (expected !== null && normalizedIdentityValue(observed) !== expected) mismatches.push(field);
  }

  return mismatches;
}

/**
 * Reconcile one child-provider observation against founder-approved declaration evidence.
 *
 * The function is intentionally provider-neutral and non-authorizing. A CURRENT result means only
 * that a complete, fresh observation matches the supplied declaration identity and exact scope set.
 */
export function reconcileProviderObservation(input: ProviderReconciliationInput): ProviderReconciliationResult {
  const { observation, declaration, now, maxAgeMs } = input;

  if (!observation) return result('UNKNOWN', ['OBSERVATION_MISSING'], null, declaration);
  if (observation.completeness !== 'COMPLETE') {
    return result('UNKNOWN', ['OBSERVATION_INCOMPLETE'], observation, declaration);
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return result('UNKNOWN', ['INVALID_FRESHNESS_WINDOW'], observation, declaration);
  }

  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return result('UNKNOWN', ['INVALID_NOW'], observation, declaration);

  const observedAtMs = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    return result('UNKNOWN', ['INVALID_OBSERVED_AT'], observation, declaration);
  }
  if (observedAtMs > nowMs) {
    return result('UNKNOWN', ['OBSERVATION_FROM_FUTURE'], observation, declaration);
  }
  if (!requiredObservationIdentityIsValid(observation)) {
    return result('UNKNOWN', ['OBSERVATION_IDENTITY_INVALID'], observation, declaration);
  }
  if (nowMs - observedAtMs > maxAgeMs) {
    return result('STALE', ['OBSERVATION_STALE'], observation, declaration);
  }

  if (!declaration) return result('UNDECLARED', ['DECLARATION_MISSING'], observation, null);
  if (!requiredDeclarationIdentityIsValid(declaration)) {
    return result('UNKNOWN', ['DECLARATION_INVALID'], observation, declaration);
  }

  const mismatches = identityMismatches(observation, declaration);
  if (mismatches.length > 0) {
    return result('IDENTITY_DRIFT', ['IDENTITY_DRIFT'], observation, declaration, {
      identityMismatches: mismatches,
    });
  }

  const observedScopes = canonicalScopes(observation.scopes);
  const approvedScopes = canonicalScopes(declaration.approvedScopes);
  const approvedSet = new Set(approvedScopes);
  const observedSet = new Set(observedScopes);
  const addedScopes = observedScopes.filter((scope) => !approvedSet.has(scope));
  const missingScopes = approvedScopes.filter((scope) => !observedSet.has(scope));

  if (addedScopes.length > 0 || missingScopes.length > 0) {
    const reasons: ProviderReconciliationReason[] = [];
    if (addedScopes.length > 0) reasons.push('SCOPE_ADDED');
    if (missingScopes.length > 0) reasons.push('SCOPE_MISSING');
    return result('SCOPE_DRIFT', reasons, observation, declaration, { addedScopes, missingScopes });
  }

  return result('CURRENT', ['MATCHED_CURRENT'], observation, declaration);
}
