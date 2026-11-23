export const MEDIA_ROUTER_DOMAIN_PROTOCOL_V1 = 'fcr/media-router-domain-protocol@v1' as const;
export const MEDIA_REQUEST_V1 = 'fcr/media-request@v1' as const;
export const MEDIA_ROUTER_OUTPUT_V1 = 'fcr/media-router-output@v1' as const;
export const MEDIA_RIGHTS_CHANGE_V1 = 'fcr/media-rights-change@v1' as const;
export const MEDIA_DOMAIN_AUTHORITY_GRANT_V1 = 'fcr/media-domain-authority-grant@v1' as const;

export const MEDIA_INTENTS_V1 = [
  'generate',
  'edit',
  'storyboard',
  'motion_proof',
  'hero_shot',
  'assemble',
  'caption',
  'resize',
  'compose',
  'transcode',
  'overlay',
  'publish_bundle',
] as const;

export const ASSET_KINDS_V1 = ['image', 'video', 'audio', 'composition'] as const;
export const DOMAIN_APPROVAL_KINDS_V1 = [
  'release',
  'commercial_rights',
  'factual_claim',
  'regulated_claim',
  'cross_project_reuse',
  'manual',
] as const;
export const DOMAIN_SOURCE_PROTOCOLS_V1 = ['MAKEVIDEO', 'PROJECT_LOCAL', 'MANUAL'] as const;
export const DOMAIN_APPROVAL_LEVELS_V1 = [
  'none',
  'draft',
  'internal_review',
  'release_approved',
] as const;
export const RIGHTS_CHANGE_KINDS_V1 = [
  'commercial_rights',
  'cross_project_reuse',
  'release_permission',
] as const;
export const RELEASE_STATES_V1 = ['candidate', 'published_release'] as const;

export type MediaIntentV1 = (typeof MEDIA_INTENTS_V1)[number];
export type AssetKindV1 = (typeof ASSET_KINDS_V1)[number];
export type DomainApprovalKindV1 = (typeof DOMAIN_APPROVAL_KINDS_V1)[number];
export type DomainSourceProtocolV1 = (typeof DOMAIN_SOURCE_PROTOCOLS_V1)[number];
export type DomainApprovalLevelV1 = (typeof DOMAIN_APPROVAL_LEVELS_V1)[number];
export type RightsChangeKindV1 = (typeof RIGHTS_CHANGE_KINDS_V1)[number];
export type ReleaseStateV1 = (typeof RELEASE_STATES_V1)[number];

export interface DomainApprovalReferenceV1 {
  kind: DomainApprovalKindV1;
  authorityId: string;
  issuedAt: string;
  reason?: string;
}

export interface DomainAuthorityGrantV1 {
  schema: typeof MEDIA_DOMAIN_AUTHORITY_GRANT_V1;
  kind: DomainApprovalKindV1;
  sourceProtocol: DomainSourceProtocolV1;
  sourceRecordId: string;
  assertedAt: string;
  approvalLevel: Exclude<DomainApprovalLevelV1, 'none'>;
  authorityGranted: true;
  reason?: string;
}

export interface DomainMediaContextV1 {
  schema: typeof MEDIA_ROUTER_DOMAIN_PROTOCOL_V1;
  workspaceId: string;
  projectId: string;
  releaseState: ReleaseStateV1;
  releaseReceiptId?: string;
  approvalReferences: DomainApprovalReferenceV1[];
  authorityGrants: DomainAuthorityGrantV1[];
  identityReferenceAssetIds: string[];
}

export interface MediaRequestV1 {
  schema: typeof MEDIA_REQUEST_V1;
  requestId: string;
  workspaceId: string;
  projectId: string;
  intent: MediaIntentV1;
  sourceAssetIds: string[];
  requestedAssetKind: AssetKindV1;
}

export interface MediaRightsChangeV1 {
  schema: typeof MEDIA_RIGHTS_CHANGE_V1;
  assetId: string;
  change: RightsChangeKindV1;
  upstreamAuthorityReference: string;
  authorityGranted: true;
}

export interface MediaRouterOutputV1 {
  schema: typeof MEDIA_ROUTER_OUTPUT_V1;
  requestId: string;
  assetIds: string[];
  publicationAuthorized: false;
  domainAuthorityGranted: boolean;
  releasePermitted: boolean;
  commercialRightsCleared: boolean;
  factualClaimsApproved: boolean;
  regulatedClaimsApproved: boolean;
  crossProjectReuseApproved: boolean;
  upstreamAuthorityReferences: string[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as UnknownRecord;
}

function assertExactKeys(record: UnknownRecord, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (extra.length > 0) {
    throw new Error(`${label} contains unsupported field(s): ${extra.sort().join(', ')}`);
  }
}

function requiredString(record: UnknownRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(record: UnknownRecord, key: string, label: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string when supplied`);
  }
  return value.trim();
}

function stringArray(record: UnknownRecord, key: string, label: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} must be an array`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new Error(`${label}.${key}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function booleanValue(record: UnknownRecord, key: string, label: string): boolean {
  if (typeof record[key] !== 'boolean') {
    throw new Error(`${label}.${key} must be boolean`);
  }
  return record[key] as boolean;
}

function closedEnum<T extends readonly string[]>(
  record: UnknownRecord,
  key: string,
  values: T,
  label: string,
): T[number] {
  const value = record[key];
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    throw new Error(`${label}.${key} must be one of: ${values.join(', ')}`);
  }
  return value as T[number];
}

function isoTimestamp(record: UnknownRecord, key: string, label: string): string {
  const value = requiredString(record, key, label);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${label}.${key} must be an ISO-compatible timestamp`);
  }
  return value;
}

function literalFalse(record: UnknownRecord, key: string, label: string): false {
  if (record[key] !== false) {
    throw new Error(`${label}.${key} must be literal false`);
  }
  return false;
}

function literalTrue(record: UnknownRecord, key: string, label: string): true {
  if (record[key] !== true) {
    throw new Error(`${label}.${key} must be literal true`);
  }
  return true;
}

export function parseDomainApprovalReferenceV1(value: unknown): DomainApprovalReferenceV1 {
  const label = 'DomainApprovalReferenceV1';
  const record = asRecord(value, label);
  assertExactKeys(record, ['kind', 'authorityId', 'issuedAt', 'reason'], label);

  const kind = closedEnum(record, 'kind', DOMAIN_APPROVAL_KINDS_V1, label);
  const authorityId = requiredString(record, 'authorityId', label);
  const issuedAt = isoTimestamp(record, 'issuedAt', label);
  const reason = optionalString(record, 'reason', label);

  if (kind === 'manual' && !reason) {
    throw new Error('DomainApprovalReferenceV1.reason is required for manual authority');
  }

  return reason === undefined ? { kind, authorityId, issuedAt } : { kind, authorityId, issuedAt, reason };
}

export function parseDomainAuthorityGrantV1(value: unknown): DomainAuthorityGrantV1 {
  const label = 'DomainAuthorityGrantV1';
  const record = asRecord(value, label);
  assertExactKeys(
    record,
    ['schema', 'kind', 'sourceProtocol', 'sourceRecordId', 'assertedAt', 'approvalLevel', 'authorityGranted', 'reason'],
    label,
  );
  if (record.schema !== MEDIA_DOMAIN_AUTHORITY_GRANT_V1) {
    throw new Error(`${label}.schema must equal ${MEDIA_DOMAIN_AUTHORITY_GRANT_V1}`);
  }

  const kind = closedEnum(record, 'kind', DOMAIN_APPROVAL_KINDS_V1, label);
  const sourceProtocol = closedEnum(record, 'sourceProtocol', DOMAIN_SOURCE_PROTOCOLS_V1, label);
  const sourceRecordId = requiredString(record, 'sourceRecordId', label);
  const assertedAt = isoTimestamp(record, 'assertedAt', label);
  const approvalLevel = closedEnum(record, 'approvalLevel', DOMAIN_APPROVAL_LEVELS_V1, label);
  const authorityGranted = literalTrue(record, 'authorityGranted', label);
  const reason = optionalString(record, 'reason', label);

  if (approvalLevel === 'none') {
    throw new Error('DomainAuthorityGrantV1.approvalLevel cannot be none when authorityGranted=true');
  }
  if ((sourceProtocol === 'MANUAL' || kind === 'manual') && !reason) {
    throw new Error('DomainAuthorityGrantV1.reason is required for manual authority');
  }

  const base = {
    schema: MEDIA_DOMAIN_AUTHORITY_GRANT_V1,
    kind,
    sourceProtocol,
    sourceRecordId,
    assertedAt,
    approvalLevel: approvalLevel as Exclude<DomainApprovalLevelV1, 'none'>,
    authorityGranted,
  };
  return reason === undefined ? base : { ...base, reason };
}

export function assertDomainAuthorityGrantResolvable(
  grant: DomainAuthorityGrantV1,
  sourceRecordExists: (sourceRecordId: string) => boolean,
): true {
  if (!sourceRecordExists(grant.sourceRecordId)) {
    throw new Error(`Domain authority source record not found: ${grant.sourceRecordId}`);
  }
  return true;
}

export function parseDomainMediaContextV1(value: unknown): DomainMediaContextV1 {
  const label = 'DomainMediaContextV1';
  const record = asRecord(value, label);
  assertExactKeys(
    record,
    [
      'schema',
      'workspaceId',
      'projectId',
      'releaseState',
      'releaseReceiptId',
      'approvalReferences',
      'authorityGrants',
      'identityReferenceAssetIds',
    ],
    label,
  );

  if (record.schema !== MEDIA_ROUTER_DOMAIN_PROTOCOL_V1) {
    throw new Error(`${label}.schema must equal ${MEDIA_ROUTER_DOMAIN_PROTOCOL_V1}`);
  }

  const releaseState = closedEnum(record, 'releaseState', RELEASE_STATES_V1, label);
  const releaseReceiptId = optionalString(record, 'releaseReceiptId', label);
  if (releaseState === 'published_release' && !releaseReceiptId) {
    throw new Error('DomainMediaContextV1.releaseReceiptId is required for published_release');
  }

  const approvalValue = record.approvalReferences;
  if (!Array.isArray(approvalValue)) {
    throw new Error('DomainMediaContextV1.approvalReferences must be an array');
  }
  const grantValue = record.authorityGrants ?? [];
  if (!Array.isArray(grantValue)) {
    throw new Error('DomainMediaContextV1.authorityGrants must be an array when supplied');
  }

  const base = {
    schema: MEDIA_ROUTER_DOMAIN_PROTOCOL_V1,
    workspaceId: requiredString(record, 'workspaceId', label),
    projectId: requiredString(record, 'projectId', label),
    releaseState,
    approvalReferences: approvalValue.map(parseDomainApprovalReferenceV1),
    authorityGrants: grantValue.map(parseDomainAuthorityGrantV1),
    identityReferenceAssetIds: stringArray(record, 'identityReferenceAssetIds', label),
  };

  return releaseReceiptId === undefined ? base : { ...base, releaseReceiptId };
}

export function parseMediaRequestV1(value: unknown): MediaRequestV1 {
  const label = 'MediaRequestV1';
  const record = asRecord(value, label);
  assertExactKeys(
    record,
    ['schema', 'requestId', 'workspaceId', 'projectId', 'intent', 'sourceAssetIds', 'requestedAssetKind'],
    label,
  );

  if (record.schema !== MEDIA_REQUEST_V1) {
    throw new Error(`${label}.schema must equal ${MEDIA_REQUEST_V1}`);
  }

  return {
    schema: MEDIA_REQUEST_V1,
    requestId: requiredString(record, 'requestId', label),
    workspaceId: requiredString(record, 'workspaceId', label),
    projectId: requiredString(record, 'projectId', label),
    intent: closedEnum(record, 'intent', MEDIA_INTENTS_V1, label),
    sourceAssetIds: stringArray(record, 'sourceAssetIds', label),
    requestedAssetKind: closedEnum(record, 'requestedAssetKind', ASSET_KINDS_V1, label),
  };
}

export function parseMediaRightsChangeV1(value: unknown): MediaRightsChangeV1 {
  const label = 'MediaRightsChangeV1';
  const record = asRecord(value, label);
  assertExactKeys(record, ['schema', 'assetId', 'change', 'upstreamAuthorityReference', 'authorityGranted'], label);

  if (record.schema !== MEDIA_RIGHTS_CHANGE_V1) {
    throw new Error(`${label}.schema must equal ${MEDIA_RIGHTS_CHANGE_V1}`);
  }

  return {
    schema: MEDIA_RIGHTS_CHANGE_V1,
    assetId: requiredString(record, 'assetId', label),
    change: closedEnum(record, 'change', RIGHTS_CHANGE_KINDS_V1, label),
    upstreamAuthorityReference: requiredString(record, 'upstreamAuthorityReference', label),
    authorityGranted: literalTrue(record, 'authorityGranted', label),
  };
}

export function parseMediaRouterOutputV1(value: unknown): MediaRouterOutputV1 {
  const label = 'MediaRouterOutputV1';
  const record = asRecord(value, label);
  assertExactKeys(
    record,
    [
      'schema',
      'requestId',
      'assetIds',
      'publicationAuthorized',
      'domainAuthorityGranted',
      'releasePermitted',
      'commercialRightsCleared',
      'factualClaimsApproved',
      'regulatedClaimsApproved',
      'crossProjectReuseApproved',
      'upstreamAuthorityReferences',
    ],
    label,
  );

  if (record.schema !== MEDIA_ROUTER_OUTPUT_V1) {
    throw new Error(`${label}.schema must equal ${MEDIA_ROUTER_OUTPUT_V1}`);
  }

  const output: MediaRouterOutputV1 = {
    schema: MEDIA_ROUTER_OUTPUT_V1,
    requestId: requiredString(record, 'requestId', label),
    assetIds: stringArray(record, 'assetIds', label),
    publicationAuthorized: literalFalse(record, 'publicationAuthorized', label),
    domainAuthorityGranted: booleanValue(record, 'domainAuthorityGranted', label),
    releasePermitted: booleanValue(record, 'releasePermitted', label),
    commercialRightsCleared: booleanValue(record, 'commercialRightsCleared', label),
    factualClaimsApproved: booleanValue(record, 'factualClaimsApproved', label),
    regulatedClaimsApproved: booleanValue(record, 'regulatedClaimsApproved', label),
    crossProjectReuseApproved: booleanValue(record, 'crossProjectReuseApproved', label),
    upstreamAuthorityReferences: stringArray(record, 'upstreamAuthorityReferences', label),
  };

  const boundedGrantPresent = output.releasePermitted
    || output.commercialRightsCleared
    || output.factualClaimsApproved
    || output.regulatedClaimsApproved
    || output.crossProjectReuseApproved;
  if (boundedGrantPresent && !output.domainAuthorityGranted) {
    throw new Error('MediaRouterOutputV1 domainAuthorityGranted must be true when any bounded domain approval is true');
  }
  if (output.domainAuthorityGranted && output.upstreamAuthorityReferences.length === 0) {
    throw new Error('MediaRouterOutputV1 true domain authority requires upstreamAuthorityReferences');
  }

  return output;
}

function hasGrant(
  context: DomainMediaContextV1,
  refs: ReadonlySet<string>,
  kind: DomainApprovalKindV1,
  approvalLevel?: DomainApprovalLevelV1,
): boolean {
  return context.authorityGrants.some((grant) =>
    refs.has(grant.sourceRecordId)
    && grant.kind === kind
    && (approvalLevel === undefined || grant.approvalLevel === approvalLevel),
  );
}

export function assertMediaRouterOutputAuthority(
  outputValue: unknown,
  contextValue: unknown,
  sourceRecordExists?: (sourceRecordId: string) => boolean,
): MediaRouterOutputV1 {
  const output = parseMediaRouterOutputV1(outputValue);
  const context = parseDomainMediaContextV1(contextValue);
  const refs = new Set(output.upstreamAuthorityReferences);

  for (const ref of refs) {
    const grant = context.authorityGrants.find((candidate) => candidate.sourceRecordId === ref);
    if (!grant) throw new Error(`Router output references unresolved domain authority: ${ref}`);
    if (sourceRecordExists) assertDomainAuthorityGrantResolvable(grant, sourceRecordExists);
  }

  if (output.releasePermitted) {
    if (!context.releaseReceiptId) throw new Error('releasePermitted=true requires a releaseReceiptId in domain context');
    if (!hasGrant(context, refs, 'release', 'release_approved')) {
      throw new Error('releasePermitted=true requires a referenced release_approved domain grant');
    }
  }
  if (output.commercialRightsCleared && !hasGrant(context, refs, 'commercial_rights')) {
    throw new Error('commercialRightsCleared=true requires a referenced commercial_rights domain grant');
  }
  if (output.factualClaimsApproved && !hasGrant(context, refs, 'factual_claim')) {
    throw new Error('factualClaimsApproved=true requires a referenced factual_claim domain grant');
  }
  if (output.regulatedClaimsApproved && !hasGrant(context, refs, 'regulated_claim')) {
    throw new Error('regulatedClaimsApproved=true requires a referenced regulated_claim domain grant');
  }
  if (output.crossProjectReuseApproved && !hasGrant(context, refs, 'cross_project_reuse')) {
    throw new Error('crossProjectReuseApproved=true requires a referenced cross_project_reuse domain grant');
  }

  return output;
}
