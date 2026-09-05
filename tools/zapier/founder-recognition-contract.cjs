'use strict';

const { createHash } = require('node:crypto');

const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HASH = /^[0-9a-f]{64}$/i;

const CLASSIFICATIONS = Object.freeze([
  'VERIFIED',
  'OBSERVED',
  'INFERRED',
  'HOLD',
  'BLOCKED',
]);

const OUTCOME_PLANES = Object.freeze([
  'INTENT',
  'EXECUTION_SOURCE',
  'TEST',
  'PROVIDER',
  'RUNTIME',
  'BROWSER',
  'EXTERNAL_CONSEQUENCE',
  'COVERAGE_UNKNOWN',
]);

const EVIDENCE_FRESHNESS = Object.freeze([
  'current',
  'stale',
  'historical',
  'reacquire',
]);

const SOURCE_TYPES = Object.freeze([
  'github',
  'provider',
  'runtime',
  'playwright',
  'slack',
  'gmail',
  'mailchimp',
  'drive',
  'proposal',
  'other',
]);

const PLANE_RANK = Object.freeze({
  INTENT: 0,
  EXECUTION_SOURCE: 1,
  TEST: 2,
  PROVIDER: 3,
  RUNTIME: 4,
  BROWSER: 5,
  EXTERNAL_CONSEQUENCE: 6,
  COVERAGE_UNKNOWN: -1,
});

const SOURCE_ALLOWED_PLANES = Object.freeze({
  github: new Set(['EXECUTION_SOURCE', 'TEST', 'PROVIDER', 'COVERAGE_UNKNOWN']),
  provider: new Set(['PROVIDER', 'EXTERNAL_CONSEQUENCE', 'COVERAGE_UNKNOWN']),
  runtime: new Set(['RUNTIME', 'COVERAGE_UNKNOWN']),
  playwright: new Set(['BROWSER', 'COVERAGE_UNKNOWN']),
  slack: new Set(['INTENT', 'EXTERNAL_CONSEQUENCE', 'COVERAGE_UNKNOWN']),
  gmail: new Set(['INTENT', 'EXTERNAL_CONSEQUENCE', 'COVERAGE_UNKNOWN']),
  mailchimp: new Set(['PROVIDER', 'EXTERNAL_CONSEQUENCE', 'COVERAGE_UNKNOWN']),
  drive: new Set(['INTENT', 'COVERAGE_UNKNOWN']),
  proposal: new Set(['INTENT', 'COVERAGE_UNKNOWN']),
  other: new Set(OUTCOME_PLANES),
});

function asString(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringList(value, maxItemLength = 300) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => asString(item, maxItemLength)).filter(Boolean))].sort();
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function reject(errors) {
  const error = new Error(`FOUNDER_RECOGNITION_REJECTED: ${errors.join('; ')}`);
  error.code = 'FOUNDER_RECOGNITION_REJECTED';
  error.details = errors;
  throw error;
}

function canonicalEvidence(input = {}) {
  return {
    version: 1,
    kind: 'fcr/founder-recognition-evidence',
    chain_id: asString(input.chain_id, 160).toLowerCase(),
    dedup_key: asString(input.dedup_key, 160).toLowerCase(),
    scope: asString(input.scope, 160),
    source_type: asString(input.source_type, 40).toLowerCase(),
    source_ref: asString(input.source_ref, 1200),
    source_identity: asString(input.source_identity, 240) || null,
    classification: asString(input.classification, 40).toUpperCase(),
    outcome_plane: asString(input.outcome_plane, 40).toUpperCase(),
    evidence_freshness: asString(input.evidence_freshness, 40).toLowerCase(),
    observed_at: asString(input.observed_at, 64),
    outcome_claim: asString(input.outcome_claim, 600) || null,
    proves: asStringList(input.proves, 240),
    does_not_prove: asStringList(input.does_not_prove, 240),
    contradiction_refs: asStringList(input.contradiction_refs, 1200),
    supersedes_dedup_keys: asStringList(input.supersedes_dedup_keys, 160).map((value) => value.toLowerCase()),
  };
}

function validateCanonicalEvidence(identity) {
  const errors = [];

  if (!IDENTIFIER.test(identity.chain_id)) errors.push('chain_id is invalid');
  if (!IDENTIFIER.test(identity.dedup_key)) errors.push('dedup_key is invalid');
  if (!identity.scope) errors.push('scope is required');
  if (!SOURCE_TYPES.includes(identity.source_type)) errors.push('source_type is invalid');
  if (!identity.source_ref) errors.push('source_ref is required');
  if (!CLASSIFICATIONS.includes(identity.classification)) errors.push('classification is invalid');
  if (!OUTCOME_PLANES.includes(identity.outcome_plane)) errors.push('outcome_plane is invalid');
  if (!EVIDENCE_FRESHNESS.includes(identity.evidence_freshness)) errors.push('evidence_freshness is invalid');
  if (!ISO_DATE.test(identity.observed_at) || Number.isNaN(Date.parse(identity.observed_at))) {
    errors.push('observed_at must be ISO UTC');
  }

  const allowedPlanes = SOURCE_ALLOWED_PLANES[identity.source_type];
  if (allowedPlanes && !allowedPlanes.has(identity.outcome_plane)) {
    errors.push(`${identity.source_type} may not certify ${identity.outcome_plane}`);
  }

  if (identity.classification === 'VERIFIED' && identity.evidence_freshness !== 'current') {
    errors.push('VERIFIED evidence must be current');
  }
  if (identity.outcome_plane === 'COVERAGE_UNKNOWN' && identity.classification === 'VERIFIED') {
    errors.push('COVERAGE_UNKNOWN may not be VERIFIED');
  }
  if (identity.outcome_plane !== 'COVERAGE_UNKNOWN' && !identity.outcome_claim) {
    errors.push('outcome_claim is required outside COVERAGE_UNKNOWN');
  }
  if (identity.classification === 'VERIFIED' && identity.proves.length === 0) {
    errors.push('VERIFIED evidence must declare what it proves');
  }
  if (identity.supersedes_dedup_keys.includes(identity.dedup_key)) {
    errors.push('evidence may not supersede its own dedup_key');
  }

  if (errors.length > 0) reject(errors);
}

function buildFounderRecognitionEvidence(input = {}) {
  const identity = canonicalEvidence(input);
  validateCanonicalEvidence(identity);

  return Object.freeze({
    ...identity,
    evidence_hash: hash(identity),
    authority: Object.freeze({
      evidence_only: true,
      can_upgrade_truth: false,
      can_authorize_publish: false,
      can_execute: false,
      can_increase_authority: false,
      historical_truth_immutable: true,
      current_truth_requires_reobservation: true,
    }),
  });
}

function validateFounderRecognitionEvidence(input) {
  const value = record(input);
  if (!value) reject(['evidence must be an object']);
  const identity = canonicalEvidence(value);
  validateCanonicalEvidence(identity);
  const evidenceHash = asString(value.evidence_hash, 64).toLowerCase();
  if (!HASH.test(evidenceHash)) reject(['evidence_hash must be SHA-256']);
  if (hash(identity) !== evidenceHash) reject(['evidence_hash does not match canonical evidence identity']);

  const authority = record(value.authority);
  if (!authority
      || authority.evidence_only !== true
      || authority.can_upgrade_truth !== false
      || authority.can_authorize_publish !== false
      || authority.can_execute !== false
      || authority.can_increase_authority !== false
      || authority.historical_truth_immutable !== true
      || authority.current_truth_requires_reobservation !== true) {
    reject(['evidence authority boundary is invalid']);
  }

  return Object.freeze({ ...identity, evidence_hash: evidenceHash });
}

function statusFromEvidence(items) {
  if (items.some((item) => item.classification === 'BLOCKED')) return 'BLOCKED';
  if (items.some((item) => item.classification === 'HOLD')) return 'HOLD';
  if (items.some((item) => item.classification === 'OBSERVED')) return 'OBSERVED';
  if (items.some((item) => item.classification === 'INFERRED')) return 'INFERRED';
  return 'NO_MATERIAL_OUTCOME';
}

function compileFounderRecognitionChain(evidenceItems = []) {
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
    reject(['at least one evidence item is required']);
  }

  const validated = evidenceItems.map(validateFounderRecognitionEvidence);
  const chainIds = [...new Set(validated.map((item) => item.chain_id))];
  if (chainIds.length !== 1) reject(['all evidence items must share one chain_id']);

  const dedup = new Map();
  const dedupConflicts = [];
  let duplicateCount = 0;
  for (const item of validated) {
    const prior = dedup.get(item.dedup_key);
    if (!prior) {
      dedup.set(item.dedup_key, item);
      continue;
    }
    if (prior.evidence_hash === item.evidence_hash) {
      duplicateCount += 1;
      continue;
    }
    dedupConflicts.push(`dedup:${item.dedup_key}`);
  }

  const unique = [...dedup.values()];
  const supersededKeys = new Set(unique.flatMap((item) => item.supersedes_dedup_keys));
  const active = unique.filter((item) => !supersededKeys.has(item.dedup_key));
  const contradictionRefs = [...new Set([
    ...dedupConflicts,
    ...active.flatMap((item) => item.contradiction_refs),
  ])].sort();

  const eligible = active
    .filter((item) => item.classification === 'VERIFIED')
    .filter((item) => item.evidence_freshness === 'current')
    .filter((item) => item.outcome_plane !== 'COVERAGE_UNKNOWN')
    .filter((item) => item.contradiction_refs.length === 0)
    .sort((a, b) => {
      const rankDelta = PLANE_RANK[b.outcome_plane] - PLANE_RANK[a.outcome_plane];
      if (rankDelta !== 0) return rankDelta;
      return Date.parse(b.observed_at) - Date.parse(a.observed_at);
    });

  const blocking = active.filter((item) => item.classification === 'HOLD' || item.classification === 'BLOCKED');
  const blockingPlanes = [...new Set(blocking.map((item) => item.outcome_plane))].sort(
    (a, b) => PLANE_RANK[b] - PLANE_RANK[a],
  );

  const selected = contradictionRefs.length === 0 ? eligible[0] || null : null;
  const classification = selected ? 'VERIFIED' : contradictionRefs.length > 0 ? 'HOLD' : statusFromEvidence(active);

  const identity = {
    version: 1,
    kind: 'fcr/founder-recognition-compilation',
    chain_id: chainIds[0],
    classification,
    highest_outcome_plane: selected?.outcome_plane || null,
    recognized_outcome: selected?.outcome_claim || null,
    current_event_hash: selected?.evidence_hash || null,
    evidence_hashes: active.map((item) => item.evidence_hash).sort(),
    duplicate_count: duplicateCount,
    contradiction_refs: contradictionRefs,
    blocked_planes: blockingPlanes,
    superseded_dedup_keys: [...supersededKeys].sort(),
    current_as_of: active
      .map((item) => item.observed_at)
      .sort()
      .at(-1) || null,
  };

  return Object.freeze({
    ...identity,
    recognition_hash: hash(identity),
    authority: Object.freeze({
      recognition_only: true,
      highest_plane_may_not_exceed_evidence: true,
      can_authorize_publish: false,
      can_execute: false,
      can_increase_authority: false,
      contradictions_fail_closed: true,
      duplicate_events_count_once: true,
      historical_truth_immutable: true,
      current_truth_requires_reobservation: true,
    }),
  });
}

module.exports = {
  buildFounderRecognitionEvidence,
  validateFounderRecognitionEvidence,
  compileFounderRecognitionChain,
  CLASSIFICATIONS,
  EVIDENCE_FRESHNESS,
  OUTCOME_PLANES,
  PLANE_RANK,
  SOURCE_TYPES,
};
