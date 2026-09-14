import { createHash } from 'node:crypto';
import { getKnownProject } from '../config/portfolio.js';

export type UnifiedMemoryKind =
  | 'working'
  | 'episodic'
  | 'semantic'
  | 'decision'
  | 'evidence'
  | 'goal'
  | 'narrative'
  | 'audit';

export type UnifiedMemoryTrust =
  | 'verified'
  | 'submitted-unverified'
  | 'inferred'
  | 'unknown'
  | 'revoked';

export type UnifiedMemoryPrivacy = 'public' | 'internal' | 'private' | 'restricted';
export type UnifiedMemoryObservationState = 'fresh' | 'stale' | 'invalid' | 'future' | 'revoked';
export type UnifiedMemoryContentMode = 'sanitized-summary' | 'metadata-only';
export type UnifiedMemorySourceVerification = 'authenticated-source' | 'untrusted-import';
export type UnifiedMemoryProjectRegistration = 'registered' | 'external';

interface NativeKindPolicy {
  kind: UnifiedMemoryKind;
  durable: boolean;
}

interface SourcePolicy {
  repository: string;
  contentMode: UnifiedMemoryContentMode;
  allowedPrivacy: readonly UnifiedMemoryPrivacy[];
  nativeKinds: Readonly<Record<string, NativeKindPolicy>>;
  projectScope: 'portfolio' | 'external';
  fixedProjectSlug: string | null;
}

/**
 * One normalization membrane for the memory-shaped systems already present
 * across the founder portfolio. Native storage remains owned by each product.
 * This registry only defines how a sanitized observation may enter FCR's
 * cross-system read model.
 *
 * `external` sources may contribute continuity, but they do not gain current
 * decision-support authority until their project identity is explicitly added
 * to the canonical FCR portfolio registry and this policy is updated.
 */
export const UNIFIED_MEMORY_SOURCE_POLICIES = {
  'founder-control-room': {
    repository: 'jussray/founder-control-room',
    contentMode: 'sanitized-summary',
    allowedPrivacy: ['public', 'internal', 'private'],
    nativeKinds: {
      mission: { kind: 'goal', durable: false },
      event: { kind: 'episodic', durable: false },
      evidence: { kind: 'evidence', durable: true },
      decision: { kind: 'decision', durable: true },
    },
    projectScope: 'portfolio',
    fixedProjectSlug: null,
  },
  'chief-ai-machine': {
    repository: 'jussray/chief-ai-machine',
    contentMode: 'sanitized-summary',
    allowedPrivacy: ['public', 'internal', 'private'],
    nativeKinds: {
      'company-brain': { kind: 'semantic', durable: true },
      'executive-brief': { kind: 'decision', durable: true },
      'specialist-report': { kind: 'evidence', durable: true },
      'prompt-draft': { kind: 'working', durable: false },
    },
    projectScope: 'portfolio',
    fixedProjectSlug: 'chief-ai-machine',
  },
  storyengine: {
    repository: 'jussray/StoryEngine',
    contentMode: 'sanitized-summary',
    allowedPrivacy: ['public', 'internal', 'private'],
    nativeKinds: {
      event: { kind: 'episodic', durable: false },
      canon: { kind: 'narrative', durable: true },
      'semantic-cache': { kind: 'semantic', durable: false },
      'decision-artifact': { kind: 'decision', durable: true },
    },
    projectScope: 'portfolio',
    fixedProjectSlug: 'l99',
  },
  promptos: {
    repository: 'jussray/promptos',
    contentMode: 'sanitized-summary',
    allowedPrivacy: ['public', 'internal', 'private'],
    nativeKinds: {
      'prompt-asset': { kind: 'semantic', durable: true },
      'mission-compiler': { kind: 'goal', durable: false },
      'command-receipt': { kind: 'working', durable: false },
    },
    projectScope: 'portfolio',
    fixedProjectSlug: 'promptos',
  },
  'sekret-bip': {
    repository: 'jussray/Sekret-Bip',
    contentMode: 'metadata-only',
    allowedPrivacy: ['private', 'restricted'],
    nativeKinds: {
      'conversation-history': { kind: 'working', durable: false },
      'memory-category': { kind: 'semantic', durable: false },
      'reflection-metadata': { kind: 'episodic', durable: false },
    },
    projectScope: 'portfolio',
    fixedProjectSlug: 'sekret-bip',
  },
  'think-tank': {
    repository: 'jussray/THINK-TANK',
    contentMode: 'sanitized-summary',
    allowedPrivacy: ['internal', 'private'],
    nativeKinds: {
      'idea-record': { kind: 'semantic', durable: true },
      'version-receipt': { kind: 'episodic', durable: true },
      scorecard: { kind: 'decision', durable: true },
    },
    projectScope: 'external',
    fixedProjectSlug: 'think-tank',
  },
  solcontinuity: {
    repository: 'jussray/solcontinuity',
    contentMode: 'sanitized-summary',
    allowedPrivacy: ['public', 'internal', 'private'],
    nativeKinds: {
      'evidence-history': { kind: 'evidence', durable: true },
      'resilience-manifest': { kind: 'semantic', durable: true },
    },
    projectScope: 'external',
    fixedProjectSlug: 'solcontinuity',
  },
  'sleepwealth-agent': {
    repository: 'jussray/SleepWealth-Agent',
    contentMode: 'metadata-only',
    allowedPrivacy: ['private', 'restricted'],
    nativeKinds: {
      'audit-entry': { kind: 'audit', durable: true },
      'portfolio-state': { kind: 'evidence', durable: false },
      approval: { kind: 'decision', durable: true },
    },
    projectScope: 'external',
    fixedProjectSlug: 'sleepwealth-agent',
  },
} as const satisfies Readonly<Record<string, SourcePolicy>>;

export type UnifiedMemorySourceSystem = keyof typeof UNIFIED_MEMORY_SOURCE_POLICIES;

/**
 * Raw native observations intentionally carry no authentication classification.
 * Data is not allowed to authenticate itself. This normalizer therefore emits
 * untrusted-import records only. A future transport adapter may introduce an
 * authenticated path after it proves source identity outside the payload.
 */
export interface NativeMemoryObservation {
  sourceSystem: UnifiedMemorySourceSystem;
  projectSlug: string;
  repository: string;
  nativeKind: string;
  nativeId: string;
  observedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  sourceSha?: string | null;
  trust: UnifiedMemoryTrust;
  privacy: UnifiedMemoryPrivacy;
  summary?: string | null;
  categoryKeys?: readonly string[] | null;
  contentHash?: string | null;
  provenanceRefs: readonly string[];
}

export interface UnifiedMemoryRecord {
  version: 'fcr-unified-memory@v1';
  identityKey: string;
  continuityFingerprint: string;
  sourceSystem: UnifiedMemorySourceSystem;
  sourceVerification: UnifiedMemorySourceVerification;
  projectSlug: string;
  projectRegistration: UnifiedMemoryProjectRegistration;
  repository: string;
  nativeKind: string;
  nativeId: string;
  kind: UnifiedMemoryKind;
  durable: boolean;
  observedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  sourceSha: string | null;
  trust: UnifiedMemoryTrust;
  privacy: UnifiedMemoryPrivacy;
  contentMode: UnifiedMemoryContentMode;
  summary: string | null;
  categoryKeys: string[];
  contentHash: string | null;
  provenanceRefs: string[];
  observationState: UnifiedMemoryObservationState;
  continuityUsable: boolean;
  decisionSupportUsable: boolean;
  executionAuthority: false;
}

export interface UnifiedMemoryRejection {
  index: number;
  errors: string[];
}

export interface UnifiedMemoryConflict {
  identityKey: string;
  observedAt: string;
  fingerprints: string[];
  variants: number;
}

export interface UnifiedMemoryView {
  version: 'fcr-unified-memory-view@v1';
  generatedAt: string;
  records: UnifiedMemoryRecord[];
  rejected: UnifiedMemoryRejection[];
  conflicts: UnifiedMemoryConflict[];
  summary: {
    accepted: number;
    rejected: number;
    conflicted: number;
    fresh: number;
    stale: number;
    verifiedForDecisionSupport: number;
    metadataOnly: number;
    externalContinuityOnly: number;
  };
  executionAuthority: false;
}

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/i;
const SAFE_ID = /^[A-Za-z0-9._:/-]{1,200}$/;
const SAFE_CATEGORY_KEY = /^[A-Za-z0-9_-]{1,80}$/;
const SAFE_PROVENANCE_REF = /^[A-Za-z0-9._:/#@-]{1,200}$/;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_FRESHNESS_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SUMMARY_LENGTH = 800;
const MAX_PROVENANCE_REFS = 20;
const VALID_TRUST = new Set<UnifiedMemoryTrust>([
  'verified',
  'submitted-unverified',
  'inferred',
  'unknown',
  'revoked',
]);

function safeTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedUniqueStrings(
  values: readonly string[] | null | undefined,
  pattern: RegExp,
  maxItems: number,
): string[] | null {
  if (!values) return [];
  if (!Array.isArray(values) || values.length > maxItems) return null;
  const output: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!pattern.test(normalized) || output.includes(normalized)) return null;
    output.push(normalized);
  }
  return output.sort();
}

function boundedProvenanceRefs(values: readonly string[]): string[] | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_PROVENANCE_REFS) return null;
  const output: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!SAFE_PROVENANCE_REF.test(normalized) || output.includes(normalized)) return null;
    output.push(normalized);
  }
  return output.sort();
}

function normalizedSummary(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SUMMARY_LENGTH || normalized.includes('\u0000')) return undefined;
  return normalized;
}

function nonAuthorizingFingerprint(parts: readonly unknown[]): string {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `memfp:sha256:${digest}`;
}

function observationState(input: {
  trust: UnifiedMemoryTrust;
  observedAt: number;
  expiresAt: number | null;
  now: Date;
}): UnifiedMemoryObservationState {
  if (input.trust === 'revoked') return 'revoked';
  const now = input.now.getTime();
  if (input.observedAt > now + FUTURE_CLOCK_SKEW_MS) return 'future';
  if (input.expiresAt !== null && input.expiresAt <= now) return 'stale';
  if (now - input.observedAt >= DEFAULT_FRESHNESS_MS) return 'stale';
  return 'fresh';
}

function effectiveObservationTime(record: UnifiedMemoryRecord): number {
  const observedAt = Date.parse(record.observedAt);
  const revokedAt = record.revokedAt ? Date.parse(record.revokedAt) : Number.NEGATIVE_INFINITY;
  return Math.max(observedAt, revokedAt);
}

function canonicalObservationKey(record: UnifiedMemoryRecord): string {
  return JSON.stringify([
    record.identityKey,
    record.sourceVerification,
    record.projectRegistration,
    record.repository,
    record.kind,
    record.durable,
    record.observedAt,
    record.expiresAt,
    record.revokedAt,
    record.sourceSha,
    record.trust,
    record.privacy,
    record.contentMode,
    record.summary,
    record.categoryKeys,
    record.contentHash,
    record.provenanceRefs,
    record.observationState,
  ]);
}

export function normalizeUnifiedMemoryObservation(
  input: NativeMemoryObservation,
  now = new Date(),
): { ok: true; record: UnifiedMemoryRecord } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const policy = UNIFIED_MEMORY_SOURCE_POLICIES[input.sourceSystem];

  if (!policy) {
    return { ok: false, errors: [`Unknown memory source system: ${String(input.sourceSystem)}.`] };
  }

  const sourceVerification: UnifiedMemorySourceVerification = 'untrusted-import';
  const projectSlug = typeof input.projectSlug === 'string' ? input.projectSlug.trim() : '';
  const repository = typeof input.repository === 'string' ? input.repository.trim() : '';
  const nativeId = typeof input.nativeId === 'string' ? input.nativeId.trim() : '';
  const nativeKind = typeof input.nativeKind === 'string' ? input.nativeKind.trim() : '';
  const observedAt = typeof input.observedAt === 'string' ? safeTime(input.observedAt) : null;
  const hasExpiresAt = input.expiresAt !== undefined && input.expiresAt !== null;
  const expiresAt = hasExpiresAt && typeof input.expiresAt === 'string' ? safeTime(input.expiresAt) : null;
  const hasRevokedAt = input.revokedAt !== undefined && input.revokedAt !== null;
  const revokedAt = hasRevokedAt && typeof input.revokedAt === 'string' ? safeTime(input.revokedAt) : null;
  const summary = normalizedSummary(input.summary);
  const categories = boundedUniqueStrings(input.categoryKeys, SAFE_CATEGORY_KEY, 40);
  const provenanceRefs = boundedProvenanceRefs(input.provenanceRefs);
  const knownProject = getKnownProject(projectSlug);
  const projectRegistration: UnifiedMemoryProjectRegistration = knownProject?.status === 'active'
    ? 'registered'
    : 'external';

  if (!SAFE_ID.test(projectSlug)) errors.push('projectSlug must be a bounded safe identifier.');
  if (repository !== policy.repository) errors.push(`repository must be exactly ${policy.repository}.`);
  if (!SAFE_ID.test(nativeId)) errors.push('nativeId must be a bounded safe identifier.');

  if (policy.fixedProjectSlug && projectSlug !== policy.fixedProjectSlug) {
    errors.push(`${input.sourceSystem} projectSlug must be exactly ${policy.fixedProjectSlug}.`);
  }
  if (policy.projectScope === 'portfolio' && projectRegistration !== 'registered') {
    errors.push(`${input.sourceSystem} requires a registered FCR portfolio project.`);
  }
  if (policy.projectScope === 'external' && knownProject?.status !== 'external') {
    errors.push(`${input.sourceSystem} requires an explicitly indexed external project identity.`);
  }

  const nativeKinds = policy.nativeKinds as Readonly<Record<string, NativeKindPolicy>>;
  const nativeKindPolicy = nativeKinds[nativeKind];
  if (!nativeKindPolicy) errors.push(`nativeKind ${nativeKind || '(empty)'} is not allowed for ${input.sourceSystem}.`);

  if (!VALID_TRUST.has(input.trust)) errors.push('trust classification is invalid.');

  if (observedAt === null) errors.push('observedAt must be a valid timestamp.');
  if (hasExpiresAt && expiresAt === null) errors.push('expiresAt must be a valid timestamp when supplied.');
  if (observedAt !== null && expiresAt !== null && expiresAt < observedAt) {
    errors.push('expiresAt cannot predate observedAt.');
  }
  if (hasRevokedAt && revokedAt === null) errors.push('revokedAt must be a valid timestamp when supplied.');
  if (input.trust === 'revoked' && revokedAt === null) errors.push('revoked memory requires revokedAt.');
  if (input.trust !== 'revoked' && revokedAt !== null) errors.push('revokedAt is only valid for revoked memory.');

  const allowedPrivacy = policy.allowedPrivacy as readonly UnifiedMemoryPrivacy[];
  if (!allowedPrivacy.includes(input.privacy)) {
    errors.push(`${input.sourceSystem} does not allow privacy class ${input.privacy}.`);
  }

  if (summary === undefined) errors.push('summary is malformed or exceeds the bounded sanitized-summary limit.');
  if (policy.contentMode === 'metadata-only' && summary !== null) {
    errors.push(`${input.sourceSystem} is metadata-only; summary content is forbidden.`);
  }

  if (categories === null) errors.push('categoryKeys must be unique bounded safe identifiers.');

  let contentHash: string | null = null;
  if (input.contentHash !== undefined && input.contentHash !== null) {
    if (typeof input.contentHash !== 'string') {
      errors.push('contentHash must be a string when supplied.');
    } else {
      contentHash = input.contentHash.trim() || null;
      if (contentHash && !SHA256.test(contentHash)) errors.push('contentHash must use sha256:<64 hex>.');
    }
  }

  let sourceSha: string | null = null;
  if (input.sourceSha !== undefined && input.sourceSha !== null) {
    if (typeof input.sourceSha !== 'string') {
      errors.push('sourceSha must be a string when supplied.');
    } else {
      sourceSha = input.sourceSha.trim().toLowerCase() || null;
      if (sourceSha && !EXACT_SHA.test(sourceSha)) errors.push('sourceSha must be an exact 40-character SHA when supplied.');
    }
  }

  if (provenanceRefs === null) {
    errors.push(`provenanceRefs must contain 1 to ${MAX_PROVENANCE_REFS} unique opaque references.`);
  }

  if (errors.length > 0 || observedAt === null || !nativeKindPolicy || categories === null || provenanceRefs === null) {
    return { ok: false, errors };
  }

  const observedAtIso = new Date(observedAt).toISOString();
  const expiresAtIso = expiresAt === null ? null : new Date(expiresAt).toISOString();
  const revokedAtIso = revokedAt === null ? null : new Date(revokedAt).toISOString();
  const state = observationState({ trust: input.trust, observedAt, expiresAt, now });
  const identityKey = `${input.sourceSystem}:${projectSlug}:${nativeKind}:${nativeId}`;
  const sanitizedSummary = policy.contentMode === 'sanitized-summary' ? summary ?? null : null;
  const normalizedCategories = categories;
  const fingerprint = nonAuthorizingFingerprint([
    identityKey,
    sourceVerification,
    projectRegistration,
    repository,
    nativeKindPolicy.kind,
    nativeKindPolicy.durable,
    observedAtIso,
    expiresAtIso,
    revokedAtIso,
    input.trust,
    input.privacy,
    sourceSha,
    contentHash,
    sanitizedSummary,
    normalizedCategories,
    provenanceRefs,
  ]);
  const continuityUsable = state !== 'invalid'
    && state !== 'future'
    && state !== 'revoked'
    && input.trust !== 'unknown';

  // Raw normalization is deliberately continuity-only. Decision support must
  // be promoted by a future adapter that authenticates the source out-of-band.
  const decisionSupportUsable = false;

  return {
    ok: true,
    record: {
      version: 'fcr-unified-memory@v1',
      identityKey,
      continuityFingerprint: fingerprint,
      sourceSystem: input.sourceSystem,
      sourceVerification,
      projectSlug,
      projectRegistration,
      repository,
      nativeKind,
      nativeId,
      kind: nativeKindPolicy.kind,
      durable: nativeKindPolicy.durable,
      observedAt: observedAtIso,
      expiresAt: expiresAtIso,
      revokedAt: revokedAtIso,
      sourceSha,
      trust: input.trust,
      privacy: input.privacy,
      contentMode: policy.contentMode,
      summary: sanitizedSummary,
      categoryKeys: normalizedCategories,
      contentHash,
      provenanceRefs,
      observationState: state,
      continuityUsable,
      decisionSupportUsable,
      executionAuthority: false,
    },
  };
}

export function buildUnifiedMemoryView(
  inputs: readonly NativeMemoryObservation[],
  now = new Date(),
): UnifiedMemoryView {
  const rejected: UnifiedMemoryRejection[] = [];
  const normalized: UnifiedMemoryRecord[] = [];

  inputs.forEach((input, index) => {
    const result = normalizeUnifiedMemoryObservation(input, now);
    if (result.ok) normalized.push(result.record);
    else rejected.push({ index, errors: result.errors });
  });

  const byIdentity = new Map<string, UnifiedMemoryRecord[]>();
  for (const record of normalized) {
    const values = byIdentity.get(record.identityKey) ?? [];
    values.push(record);
    byIdentity.set(record.identityKey, values);
  }

  const records: UnifiedMemoryRecord[] = [];
  const conflicts: UnifiedMemoryConflict[] = [];

  for (const [identityKey, observations] of byIdentity) {
    observations.sort((a, b) => effectiveObservationTime(b) - effectiveObservationTime(a));
    const newestEffectiveTime = effectiveObservationTime(observations[0]!);
    const newest = observations.filter((record) => effectiveObservationTime(record) === newestEffectiveTime);
    const logicalVariants = [...new Set(newest.map(canonicalObservationKey))];

    if (logicalVariants.length > 1) {
      conflicts.push({
        identityKey,
        observedAt: new Date(newestEffectiveTime).toISOString(),
        fingerprints: [...new Set(newest.map((record) => record.continuityFingerprint))].sort(),
        variants: logicalVariants.length,
      });
      continue;
    }

    const current = newest[0];
    if (current) records.push(current);
  }

  records.sort((a, b) => effectiveObservationTime(b) - effectiveObservationTime(a) || a.identityKey.localeCompare(b.identityKey));
  conflicts.sort((a, b) => a.identityKey.localeCompare(b.identityKey));

  return {
    version: 'fcr-unified-memory-view@v1',
    generatedAt: now.toISOString(),
    records,
    rejected,
    conflicts,
    summary: {
      accepted: records.length,
      rejected: rejected.length,
      conflicted: conflicts.length,
      fresh: records.filter((record) => record.observationState === 'fresh').length,
      stale: records.filter((record) => record.observationState === 'stale').length,
      verifiedForDecisionSupport: records.filter((record) => record.decisionSupportUsable).length,
      metadataOnly: records.filter((record) => record.contentMode === 'metadata-only').length,
      externalContinuityOnly: records.filter((record) => record.projectRegistration === 'external').length,
    },
    executionAuthority: false,
  };
}

export function memoryRecordsForDecisionSupport(
  view: UnifiedMemoryView,
  now = new Date(),
): UnifiedMemoryRecord[] {
  const currentTime = now.getTime();
  return view.records.filter((record) => {
    if (!record.decisionSupportUsable) return false;
    if (record.sourceVerification !== 'authenticated-source') return false;
    if (record.projectRegistration !== 'registered' || record.trust !== 'verified') return false;
    if (record.revokedAt !== null) return false;

    const observedAt = Date.parse(record.observedAt);
    if (!Number.isFinite(observedAt) || observedAt > currentTime + FUTURE_CLOCK_SKEW_MS) return false;
    if (currentTime - observedAt >= DEFAULT_FRESHNESS_MS) return false;

    if (record.expiresAt !== null) {
      const expiresAt = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= currentTime) return false;
    }

    return true;
  });
}

export function memoryRecordsForContinuity(view: UnifiedMemoryView): UnifiedMemoryRecord[] {
  return view.records.filter((record) => record.continuityUsable);
}
