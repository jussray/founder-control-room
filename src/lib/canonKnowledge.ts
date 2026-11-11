import { createHash } from 'node:crypto';

/** Historic evidence identity is durable; operational freshness is a separate gate. */
export const CANON_KNOWLEDGE_CONTRACT = 'fcr/canon-knowledge@v1' as const;

const DIGEST = /^[0-9a-f]{64}$/;
const AUTHORITIES = ['repository', 'provider', 'runtime', 'human-outcome', 'approved-record'] as const;

export interface CanonSubject {
  project: string;
  key: string;
}

export interface CanonEvidence extends CanonSubject {
  digest: string; // digest of the observed claim, never its private content
  observedAt: string; // independent observation time, not model generation time
  receiptId: string;
  authority: (typeof AUTHORITIES)[number];
  sourceRef: string; // redacted, scoped trace reference
  verifierId: string;
}

export type CanonAction = 'established' | 'reverified' | 'superseded';

export interface CanonEvent extends CanonEvidence {
  contract: typeof CANON_KNOWLEDGE_CONTRACT;
  sequence: number;
  action: CanonAction;
  supersedes: string | null;
  eventHash: string;
}

export interface CanonRead extends CanonSubject {
  status: 'unknown' | 'last-known-verified';
  digest: string | null;
  lastVerifiedAt: string | null;
  evidenceRef: string | null;
  currentRuntimeVerified: false;
  totalObservations: number;
}

type CanonWriteGate = (context: {
  subject: CanonSubject;
  evidence: CanonEvidence;
  previous: CanonEvent | null;
  action: CanonAction;
}) => boolean;

function requiredString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max) {
    throw new Error('CANON_INVALID: ' + field + ' is required, bounded, and trimmed');
  }
  return value;
}

function canonicalTime(value: unknown): string {
  const time = requiredString(value, 'observedAt', 48);
  const timestamp = Date.parse(time);
  if (!Number.isFinite(timestamp) || !/(?:Z|[+-]\d\d:\d\d)$/.test(time)) {
    throw new Error('CANON_INVALID: observedAt must be RFC3339 with timezone');
  }
  return new Date(timestamp).toISOString();
}

function normalEvidence(raw: CanonEvidence): CanonEvidence {
  const project = requiredString(raw?.project, 'project', 120);
  const key = requiredString(raw?.key, 'key', 160);
  const digest = requiredString(raw?.digest, 'digest', 64).toLowerCase();
  if (!DIGEST.test(digest)) throw new Error('CANON_INVALID: digest must be sha256');
  if (!AUTHORITIES.includes(raw?.authority)) throw new Error('CANON_INVALID: authority is invalid');
  return {
    project, key, digest, observedAt: canonicalTime(raw.observedAt),
    receiptId: requiredString(raw.receiptId, 'receiptId'),
    authority: raw.authority,
    sourceRef: requiredString(raw.sourceRef, 'sourceRef', 500),
    verifierId: requiredString(raw.verifierId, 'verifierId'),
  };
}

function eventIdentity(event: Omit<CanonEvent, 'eventHash'>): Omit<CanonEvent, 'eventHash'> {
  return {
    contract: CANON_KNOWLEDGE_CONTRACT,
    sequence: event.sequence,
    project: event.project,
    key: event.key,
    digest: event.digest,
    observedAt: event.observedAt,
    receiptId: event.receiptId,
    authority: event.authority,
    sourceRef: event.sourceRef,
    verifierId: event.verifierId,
    action: event.action,
    supersedes: event.supersedes,
  };
}

function hashIdentity(identity: Omit<CanonEvent, 'eventHash'>): string {
  return createHash('sha256').update(JSON.stringify(eventIdentity(identity))).digest('hex');
}

/** Verify a hash-linked history before accepting either a read or a write. */
export function readCanonKnowledge(history: readonly CanonEvent[], subject: CanonSubject): CanonRead {
  if (!Array.isArray(history)) throw new Error('CANON_INVALID: history must be an array');
  const project = requiredString(subject?.project, 'project', 120);
  const key = requiredString(subject?.key, 'key', 160);
  let prior: CanonEvent | null = null;
  const receipts = new Set<string>();
  for (let index = 0; index < history.length; index++) {
    const event = history[index];
    if (!event || event.contract !== CANON_KNOWLEDGE_CONTRACT) throw new Error('CANON_INVALID: contract identity');
    const normalized = normalEvidence(event);
    if (normalized.project !== project || normalized.key !== key) throw new Error('CANON_INVALID: subject mismatch');
    if (JSON.stringify(normalized) !== JSON.stringify({
      project: event.project, key: event.key, digest: event.digest, observedAt: event.observedAt,
      receiptId: event.receiptId, authority: event.authority, sourceRef: event.sourceRef,
      verifierId: event.verifierId,
    })) throw new Error('CANON_INVALID: noncanonical evidence');
    if (event.sequence !== index + 1) throw new Error('CANON_INVALID: broken sequence');
    if (event.supersedes !== (prior?.eventHash ?? null)) throw new Error('CANON_INVALID: broken predecessor');
    const expectedAction: CanonAction = !prior ? 'established' : event.digest === prior.digest ? 'reverified' : 'superseded';
    if (event.action !== expectedAction) throw new Error('CANON_INVALID: invalid transition');
    if (prior && Date.parse(event.observedAt) <= Date.parse(prior.observedAt)) {
      throw new Error('CANON_INVALID: observations must be strictly newer');
    }
    if (receipts.has(event.receiptId)) throw new Error('CANON_INVALID: duplicate receipt');
    receipts.add(event.receiptId);
    if (!DIGEST.test(event.eventHash) || event.eventHash !== hashIdentity(event)) {
      throw new Error('CANON_INVALID: event integrity failure');
    }
    prior = event;
  }
  return {
    status: prior ? 'last-known-verified' : 'unknown', project, key,
    digest: prior?.digest ?? null, lastVerifiedAt: prior?.observedAt ?? null,
    evidenceRef: prior?.receiptId ?? null,
    // Never use this registry as an at-use truth lease or deploy/merge gate.
    currentRuntimeVerified: false, totalObservations: history.length,
  };
}

/**
 * Append-only candidate. verifyEvidence MUST perform independent evidence
 * validation using trusted provider/receipt authority; authorizeWrite MUST
 * enforce project- and consequence-scoped founder permissions. Neither gate
 * may be implemented by a model assertion or raw request body field.
 * Persistence with append-only ACLs/transactions remains a caller obligation.
 */
export function appendVerifiedCanon({
  history, subject, evidence, verifyEvidence, authorizeWrite,
}: {
  history: readonly CanonEvent[];
  subject: CanonSubject;
  evidence: CanonEvidence;
  verifyEvidence: CanonWriteGate;
  authorizeWrite: CanonWriteGate;
}): CanonEvent[] {
  const current = readCanonKnowledge(history, subject);
  const normalized = normalEvidence(evidence);
  if (normalized.project !== subject.project || normalized.key !== subject.key) {
    throw new Error('CANON_INVALID: subject mismatch');
  }
  const previous = history.at(-1) ?? null;
  if (previous && Date.parse(normalized.observedAt) <= Date.parse(previous.observedAt)) {
    throw new Error('CANON_INVALID: evidence must be newer than last verified event');
  }
  if (history.some(event => event.receiptId === normalized.receiptId)) {
    throw new Error('CANON_INVALID: evidence receipt replay');
  }
  const action: CanonAction = current.status === 'unknown' ? 'established'
    : current.digest === normalized.digest ? 'reverified' : 'superseded';
  const context = Object.freeze({ subject: Object.freeze({ ...subject }), evidence: Object.freeze({ ...normalized }), previous, action });
  if (typeof verifyEvidence !== 'function' || verifyEvidence(context) !== true) {
    throw new Error('CANON_DENIED: independent evidence verification denied (verifyEvidence required)');
  }
  if (typeof authorizeWrite !== 'function' || authorizeWrite(context) !== true) {
    throw new Error('CANON_DENIED: scoped write denied (authorizeWrite required)');
  }
  const identity = eventIdentity({
    contract: CANON_KNOWLEDGE_CONTRACT, sequence: history.length + 1,
    ...normalized, action, supersedes: previous?.eventHash ?? null,
  });
  const event: CanonEvent = Object.freeze({ ...identity, eventHash: hashIdentity(identity) });
  return Object.freeze([...history, event]) as unknown as CanonEvent[];
}
