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

interface NativeKindPolicy {
  kind: UnifiedMemoryKind;
  durable: boolean;
}

interface SourcePolicy {
  repository: string;
  contentMode: UnifiedMemoryContentMode;
  allowedPrivacy: readonly UnifiedMemoryPrivacy[];
  nativeKinds: Readonly<Record<string, NativeKindPolicy>>;
}

/**
 * One normalization membrane for the memory-shaped systems already present
 * across the founder portfolio. Native storage remains owned by each product.
 * This registry only defines how a sanitized observation may enter FCR's
 * cross-system read model.
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
  },
  solcontinuity: {
    repository: 'jussray/solcontinuity',
    contentMode: 'sanitized-summary',
    allowedPrivacy: ['public', 'internal', 'private'],
    nativeKinds: {
      'evidence-history': { kind: 'evidence', durable: true },
      'resilience-manifest': { kind: 'semantic', durable: true },
    },
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
  },
} as const satisfies Readonly<Record<string, SourcePolicy>>;

export type UnifiedMemorySourceSystem = keyof typeof UNIFIED_MEMORY_SOURCE_POLICIES;

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
  projectSlug: string;
  repository: string;
  nativeKind: string;
  nativeId: string;
  kind: UnifiedMemoryKind;
  durable: boolean;
  observedAt: string;
  expiresAt: string | null;
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
  };
  executionAuthority: false;
}

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/i;
const SAFE_ID = /^[A-Za-z0-9._:/-]{1,200}$/;
const SAFE_CATEGORY_KEY = /^[A-Za-z0-9_-]{1,80}$/;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_FRESHNESS_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SUMMARY_LENGTH = 800;
const MAX_PROVENANCE_REFS = 20;
const MAX_PROVENANCE_REF_LENGTH = 500;

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
  return output;
}

function boundedProvenanceRefs(values: readonly string[]): string[] | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_PROVENANCE_REFS) return null;
  const output: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > MAX_PROVENANCE_REF_LENGTH || output.includes(normalized)) return null;
    output.push(normalized);
  }
  return output;
}

function normalizedSummary(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SUMMARY_LENGTH || normalized.includes('\u0000')) return undefined;
  return normalized;
}

function nonAuthorizingFingerprint(parts: readonly string[]): string {
  // FNV-1a is used only as a compact continuity key. It is not a security or
  // authorization primitive and must never substitute for source evidence.
  let hash = 0x811c9dc5;
  const input = parts.join('\u001f');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `memfp:${(hash >>> 0).toString(16).padStart(8, '0')}`;
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

export function normalizeUnifiedMemoryObservation(
  input: NativeMemoryObservation,
  now = new Date(),
): { ok: true; record: UnifiedMemoryRecord } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const policy = UNIFIED_MEMORY_SOURCE_POLICIES[input.sourceSystem];

  if (!policy) {
    return { ok: false, errors: [`Unknown memory source system: ${String(input.sourceSystem)}.`] };
  }

  const projectSlug = typeof input.projectSlug === 'string' ? input.projectSlug.trim() : '';
  const repository = typeof input.repository === 'string' ? input.repository.trim() : '';
  const nativeId = typeof input.nativeId === 'string' ? input.nativeId.trim() : '';
  const nativeKind = typeof input.nativeKind === 'string' ? input.nativeKind.trim() : '';
  const observedAt = safeTime(input.observedAt);
  const expiresAt = input.expiresAt ? safeTime(input.expiresAt) : null;
  const revokedAt = input.revokedAt ? safeTime(input.revokedAt) : null;
  const summary = normalizedSummary(input.summary);
  const categories = boundedUniqueStrings(input.categoryKeys, SAFE_CATEGORY_KEY, 40);
  const provenanceRefs = boundedProvenanceRefs(input.provenanceRefs);

  if (!SAFE_ID.test(projectSlug)) errors.push('projectSlug must be a bounded safe identifier.');
  if (repository !== policy.repository) errors.push(`repository must be exactly ${policy.repository}.`);
  if (!SAFE_ID.test(nativeId)) errors.push('nativeId must be a bounded safe identifier.');

  const nativeKindPolicy = policy.nativeKinds[nativeKind as keyof typeof policy.nativeKinds] as NativeKindPolicy | undefined;
  if (!nativeKindPolicy) errors.push(`nativeKind ${nativeKind || '(empty)'} is not allowed for ${input.sourceSystem}.`);

  if (observedAt === null) errors.push('observedAt must be a valid timestamp.');
  if (input.expiresAt && expiresAt === null) errors.push('expiresAt must be a valid timestamp when supplied.');
  if (observedAt !== null && expiresAt !== null && expiresAt < observedAt) {
    errors.push('expiresAt cannot predate observedAt.');
  }
  if (input.revokedAt && revokedAt === null) errors.push('revokedAt must be a valid timestamp when supplied.');
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

  const contentHash = input.contentHash?.trim() || null;
  if (contentHash && !SHA256.test(contentHash)) errors.push('contentHash must use sha256:<64 hex>.');

  const sourceSha = input.sourceSha?.trim().toLowerCase() || null;
  if (sourceSha && !EXACT_SHA.test(sourceSha)) errors.push('sourceSha must be an exact 40-character SHA when supplied.');

  if (provenanceRefs === null) {
    errors.push(`provenanceRefs must contain 1 to ${MAX_PROVENANCE_REFS} unique bounded references.`);
  }

  if (errors.length > 0 || observedAt === null || !nativeKindPolicy || categories === null || provenanceRefs === null) {
    return { ok: false, errors };
  }

  const state = observationState({ trust: input.trust, observedAt, expiresAt, now });
  const identityKey = `${input.sourceSystem}:${projectSlug}:${nativeKind}:${nativeId}`;
  const sanitizedSummary = policy.contentMode === 'sanitized-summary' ? summary ?? null : null;
  const normalizedCategories = categories;
  const fingerprint = nonAuthorizingFingerprint([
    identityKey,
    input.observedAt,
    input.expiresAt ?? '',
    input.trust,
    input.privacy,
    sourceSha ?? '',
    contentHash ?? '',
    sanitizedSummary ?? '',
    normalizedCategories.join(','),
    provenanceRefs.join(','),
  ]);

  return {
    ok: true,
    record: {
      version: 'fcr-unified-memory@v1',
      identityKey,
      continuityFingerprint: fingerprint,
      sourceSystem: input.sourceSystem,
      projectSlug,
      repository,
      nativeKind,
      nativeId,
      kind: nativeKindPolicy.kind,
      durable: nativeKindPolicy.durable,
      observedAt: new Date(observedAt).toISOString(),
      expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      sourceSha,
      trust: input.trust,
      privacy: input.privacy,
      contentMode: policy.contentMode,
      summary: sanitizedSummary,
      categoryKeys: normalizedCategories,
      contentHash,
      provenanceRefs,
      observationState: state,
      continuityUsable: state !== 'invalid' && state !== 'future' && state !== 'revoked' && input.trust !== 'unknown',
      decisionSupportUsable: state === 'fresh' && input.trust === 'verified',
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
    observations.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
    const newestTime = observations[0]?.observedAt;
    const newest = observations.filter((record) => record.observedAt === newestTime);
    const uniqueFingerprints = [...new Set(newest.map((record) => record.continuityFingerprint))];

    if (uniqueFingerprints.length > 1) {
      conflicts.push({
        identityKey,
        observedAt: newestTime ?? '',
        fingerprints: uniqueFingerprints.sort(),
      });
      continue;
    }

    const current = newest[0];
    if (current) records.push(current);
  }

  records.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.identityKey.localeCompare(b.identityKey));
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
    },
    executionAuthority: false,
  };
}

export function memoryRecordsForDecisionSupport(view: UnifiedMemoryView): UnifiedMemoryRecord[] {
  return view.records.filter((record) => record.decisionSupportUsable);
}

export function memoryRecordsForContinuity(view: UnifiedMemoryView): UnifiedMemoryRecord[] {
  return view.records.filter((record) => record.continuityUsable);
}
