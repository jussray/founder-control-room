import { getPortfolioProject } from '../config/portfolio.js';
import {
  normalizeUnifiedMemoryObservation,
  type NativeMemoryObservation,
  type UnifiedMemoryRecord,
  type UnifiedMemorySourceSystem,
} from './unifiedMemory.js';

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const EXACT_CONTINUITY_FINGERPRINT = /^memfp:sha256:[0-9a-f]{64}$/i;
const SAFE_EVIDENCE_REF = /^[A-Za-z0-9._:/#@-]{1,200}$/;
const MAX_WITNESS_AGE_MS = 5 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 60 * 1000;
const DEFAULT_MEMORY_FRESHNESS_MS = 3 * 24 * 60 * 60 * 1000;

type MaybePromise<T> = T | Promise<T>;

export interface AuthenticatedMemorySourceWitness {
  version: 'fcr-memory-source-auth@v1';
  sourceSystem: UnifiedMemorySourceSystem;
  projectSlug: string;
  repository: string;
  sourceSha: string;
  continuityFingerprint: string;
  observedAt: string;
  expiresAt: string;
  evidenceRef: string;
}

export interface CurrentMemoryProjectAuthorityWitness {
  version: 'fcr-memory-project-authority@v1';
  projectSlug: string;
  repository: string;
  registration: 'registered-active';
  observedAt: string;
  expiresAt: string;
  evidenceRef: string;
}

/**
 * These dependencies are the trust root. Implementations must obtain their
 * evidence outside the caller-controlled memory payload, for example from an
 * authenticated server transport plus a current project/runtime authority
 * read. Returning a witness is an observation, not execution authority.
 */
export interface AuthenticatedUnifiedMemoryTrustRoot {
  authenticateSource(
    record: Readonly<UnifiedMemoryRecord>,
  ): MaybePromise<AuthenticatedMemorySourceWitness | null>;
  resolveCurrentProjectAuthority(
    projectSlug: string,
  ): MaybePromise<CurrentMemoryProjectAuthorityWitness | null>;
}

export interface AuthenticatedUnifiedMemoryEnvelope {
  version: 'fcr-authenticated-unified-memory@v1';
  record: UnifiedMemoryRecord;
  sourceVerification: 'authenticated-source';
  projectRegistration: 'registered';
  sourceWitness: AuthenticatedMemorySourceWitness;
  projectAuthority: CurrentMemoryProjectAuthorityWitness;
  authenticatedAt: string;
  decisionSupportUsable: true;
  executionAuthority: false;
}

export type AuthenticatedUnifiedMemoryResult =
  | { ok: true; envelope: AuthenticatedUnifiedMemoryEnvelope }
  | { ok: false; errors: string[] };

function parseTime(value: string): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function immutableRecordSnapshot(record: UnifiedMemoryRecord): UnifiedMemoryRecord {
  const snapshot: UnifiedMemoryRecord = {
    ...record,
    categoryKeys: [...record.categoryKeys],
    provenanceRefs: [...record.provenanceRefs],
  };
  Object.freeze(snapshot.categoryKeys);
  Object.freeze(snapshot.provenanceRefs);
  return Object.freeze(snapshot);
}

function witnessWindowIsCurrent(observedAt: string, expiresAt: string, now: Date): boolean {
  const observed = parseTime(observedAt);
  const expires = parseTime(expiresAt);
  if (observed === null || expires === null || expires <= observed) return false;

  const current = now.getTime();
  if (observed > current + FUTURE_CLOCK_SKEW_MS) return false;
  if (current - observed > MAX_WITNESS_AGE_MS) return false;
  if (expires <= current) return false;
  return true;
}

function recordIsCurrentForDecisionSupport(record: UnifiedMemoryRecord, now: Date): boolean {
  if (record.executionAuthority !== false) return false;
  if (record.sourceVerification !== 'untrusted-import') return false;
  if (record.decisionSupportUsable !== false) return false;
  if (record.projectRegistration !== 'registered') return false;
  if (record.trust !== 'verified' || record.revokedAt !== null) return false;

  const observedAt = parseTime(record.observedAt);
  if (observedAt === null) return false;
  const current = now.getTime();
  if (observedAt > current + FUTURE_CLOCK_SKEW_MS) return false;
  if (current - observedAt >= DEFAULT_MEMORY_FRESHNESS_MS) return false;

  if (record.expiresAt !== null) {
    const expiresAt = parseTime(record.expiresAt);
    if (expiresAt === null || expiresAt <= current) return false;
  }

  if (!record.sourceSha || !EXACT_SHA.test(record.sourceSha)) return false;
  if (!EXACT_CONTINUITY_FINGERPRINT.test(record.continuityFingerprint)) return false;
  return true;
}

function validateSourceWitness(
  record: UnifiedMemoryRecord,
  witness: AuthenticatedMemorySourceWitness | null,
  now: Date,
): string[] {
  if (!witness) return ['MEMORY_SOURCE_AUTHENTICATION_REQUIRED'];

  const errors: string[] = [];
  if (witness.version !== 'fcr-memory-source-auth@v1') errors.push('MEMORY_SOURCE_WITNESS_VERSION_INVALID');
  if (witness.sourceSystem !== record.sourceSystem) errors.push('MEMORY_SOURCE_SYSTEM_MISMATCH');
  if (witness.projectSlug !== record.projectSlug) errors.push('MEMORY_SOURCE_PROJECT_MISMATCH');
  if (witness.repository !== record.repository) errors.push('MEMORY_SOURCE_REPOSITORY_MISMATCH');
  if (!EXACT_SHA.test(witness.sourceSha) || witness.sourceSha.toLowerCase() !== record.sourceSha?.toLowerCase()) {
    errors.push('MEMORY_SOURCE_SHA_MISMATCH');
  }
  if (!EXACT_CONTINUITY_FINGERPRINT.test(witness.continuityFingerprint)
    || witness.continuityFingerprint.toLowerCase() !== record.continuityFingerprint.toLowerCase()) {
    errors.push('MEMORY_SOURCE_RECORD_MISMATCH');
  }
  if (!SAFE_EVIDENCE_REF.test(witness.evidenceRef)) errors.push('MEMORY_SOURCE_EVIDENCE_REF_INVALID');
  if (!witnessWindowIsCurrent(witness.observedAt, witness.expiresAt, now)) {
    errors.push('MEMORY_SOURCE_WITNESS_NOT_CURRENT');
  }
  return errors;
}

function validateProjectAuthorityWitness(
  record: UnifiedMemoryRecord,
  witness: CurrentMemoryProjectAuthorityWitness | null,
  now: Date,
): string[] {
  const canonicalProject = getPortfolioProject(record.projectSlug);
  if (!canonicalProject) return ['MEMORY_PROJECT_NOT_ACTIVE'];
  if (!witness) return ['MEMORY_PROJECT_AUTHORITY_REQUIRED'];

  const errors: string[] = [];
  if (witness.version !== 'fcr-memory-project-authority@v1') errors.push('MEMORY_PROJECT_WITNESS_VERSION_INVALID');
  if (witness.registration !== 'registered-active') errors.push('MEMORY_PROJECT_NOT_ACTIVE');
  if (witness.projectSlug !== record.projectSlug) errors.push('MEMORY_PROJECT_SLUG_MISMATCH');
  if (witness.repository !== canonicalProject.repository) errors.push('MEMORY_PROJECT_REPOSITORY_MISMATCH');
  if (!SAFE_EVIDENCE_REF.test(witness.evidenceRef)) errors.push('MEMORY_PROJECT_EVIDENCE_REF_INVALID');
  if (!witnessWindowIsCurrent(witness.observedAt, witness.expiresAt, now)) {
    errors.push('MEMORY_PROJECT_WITNESS_NOT_CURRENT');
  }
  return errors;
}

async function authenticateNormalizedRecord(
  record: UnifiedMemoryRecord,
  trustRoot: AuthenticatedUnifiedMemoryTrustRoot,
  now: Date,
): Promise<AuthenticatedUnifiedMemoryResult> {
  const recordSnapshot = immutableRecordSnapshot(record);
  if (!recordIsCurrentForDecisionSupport(recordSnapshot, now)) {
    return { ok: false, errors: ['MEMORY_RECORD_NOT_CURRENT_DECISION_EVIDENCE'] };
  }

  let sourceWitness: AuthenticatedMemorySourceWitness | null;
  let projectAuthority: CurrentMemoryProjectAuthorityWitness | null;
  try {
    [sourceWitness, projectAuthority] = await Promise.all([
      trustRoot.authenticateSource(recordSnapshot),
      trustRoot.resolveCurrentProjectAuthority(recordSnapshot.projectSlug),
    ]);
  } catch {
    return { ok: false, errors: ['MEMORY_TRUST_ROOT_UNAVAILABLE'] };
  }

  const errors = [
    ...validateSourceWitness(recordSnapshot, sourceWitness, now),
    ...validateProjectAuthorityWitness(recordSnapshot, projectAuthority, now),
  ];
  if (errors.length > 0 || !sourceWitness || !projectAuthority) return { ok: false, errors };

  const sourceWitnessSnapshot = Object.freeze({ ...sourceWitness });
  const projectAuthoritySnapshot = Object.freeze({ ...projectAuthority });
  const envelope: AuthenticatedUnifiedMemoryEnvelope = {
    version: 'fcr-authenticated-unified-memory@v1',
    record: recordSnapshot,
    sourceVerification: 'authenticated-source',
    projectRegistration: 'registered',
    sourceWitness: sourceWitnessSnapshot,
    projectAuthority: projectAuthoritySnapshot,
    authenticatedAt: now.toISOString(),
    decisionSupportUsable: true,
    executionAuthority: false,
  };

  return { ok: true, envelope: Object.freeze(envelope) };
}

/**
 * Normalize an untrusted native observation first, then obtain source identity
 * and current project authority from dependencies the payload cannot fill in.
 * The raw normalized record remains `untrusted-import`; authenticated state is
 * carried only by the envelope so provenance is never rewritten.
 */
export async function authenticateUnifiedMemoryObservation(
  input: NativeMemoryObservation,
  trustRoot: AuthenticatedUnifiedMemoryTrustRoot,
  now = new Date(),
): Promise<AuthenticatedUnifiedMemoryResult> {
  const normalized = normalizeUnifiedMemoryObservation(input, now);
  if (!normalized.ok) return normalized;
  return authenticateNormalizedRecord(normalized.record, trustRoot, now);
}

/**
 * Re-run source authentication and current project authority at the use
 * boundary. A cached envelope therefore cannot keep decision support alive
 * after either witness, the source identity, project registration, or the
 * underlying memory freshness changes.
 */
export async function authenticatedMemoryForDecisionSupport(
  envelopes: readonly AuthenticatedUnifiedMemoryEnvelope[],
  trustRoot: AuthenticatedUnifiedMemoryTrustRoot,
  now = new Date(),
): Promise<AuthenticatedUnifiedMemoryEnvelope[]> {
  const current: AuthenticatedUnifiedMemoryEnvelope[] = [];

  for (const envelope of envelopes) {
    if (envelope.executionAuthority !== false || envelope.record.executionAuthority !== false) continue;
    const refreshed = await authenticateNormalizedRecord(envelope.record, trustRoot, now);
    if (refreshed.ok) current.push(refreshed.envelope);
  }

  return current;
}
