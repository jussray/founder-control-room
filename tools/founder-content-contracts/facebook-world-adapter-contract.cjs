const { createHash } = require('node:crypto');

const WORLD_OBSERVATION_SCHEMA = 'fcr/world-observation@v1';
const ASSESSMENTS = new Set(['unknown', 'passed', 'failed']);

const OBSERVATION_AUTHORITY = Object.freeze({
  scope: 'evidence-only',
  permitsExecution: false,
  permitsPublishing: false,
  permitsDeployment: false,
  permitsBilling: false,
  permitsApproval: false,
  permitsAuthorityTransfer: false,
});

function text(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function integer(value, { signed = false } = {}) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed)) throw new Error('World observation metrics must use safe integers');
  if (!signed && parsed < 0) throw new Error('World observation metrics cannot be negative');
  return parsed;
}

function sourceRefs(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => text(value, 500)).filter(Boolean))].slice(0, 30);
}

function currency(value) {
  const code = text(value || 'USD', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('World observation currency must be a three-letter code');
  return code;
}

function assessment(value) {
  const normalized = text(value, 20) || 'unknown';
  if (!ASSESSMENTS.has(normalized)) throw new Error('World observation assessment is unsupported');
  return normalized;
}

function sha(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function authorityCopy() {
  return { ...OBSERVATION_AUTHORITY };
}

function buildWorldObservationReceipt(input = {}, now = new Date()) {
  const experimentId = text(input.experimentId, 180);
  const contentId = text(input.contentId, 180);
  const platform = text(input.platform, 80).toLowerCase();
  const observedAt = new Date(input.observedAt || now).toISOString();
  const refs = sourceRefs(input.sourceRefs);
  if (!experimentId) throw new Error('World observation requires experimentId');
  if (!contentId) throw new Error('World observation requires contentId');
  if (!platform) throw new Error('World observation requires platform');
  if (refs.length === 0) throw new Error('World observation requires at least one source receipt');

  const metrics = {
    reach: integer(input.metrics?.reach),
    qualifiedViews: integer(input.metrics?.qualifiedViews),
    nonQualifiedViews: integer(input.metrics?.nonQualifiedViews),
    watchTimeSeconds: integer(input.metrics?.watchTimeSeconds),
    engagements: integer(input.metrics?.engagements),
    followerDelta: integer(input.metrics?.followerDelta, { signed: true }),
    profileActions: integer(input.metrics?.profileActions),
    clicks: integer(input.metrics?.clicks),
    conversions: integer(input.metrics?.conversions),
  };

  const money = {
    currency: currency(input.money?.currency),
    platformContentRevenueCents: integer(input.money?.platformContentRevenueCents),
    starsRevenueCents: integer(input.money?.starsRevenueCents),
    attributableProductRevenueCents: integer(input.money?.attributableProductRevenueCents),
    partnershipRevenueCents: integer(input.money?.partnershipRevenueCents),
  };

  const identity = {
    schema: WORLD_OBSERVATION_SCHEMA,
    workspaceId: text(input.workspaceId, 120) || 'default',
    projectId: text(input.projectId, 120) || 'general',
    experimentId,
    platform,
    contentId,
    format: text(input.format, 80) || null,
    contentFingerprint: text(input.contentFingerprint, 180) || null,
    promptVersion: text(input.promptVersion, 180) || null,
    predictionReceiptId: text(input.predictionReceiptId, 180) || null,
    metrics,
    money,
    assessments: {
      platform: assessment(input.assessments?.platform),
      founder: assessment(input.assessments?.founder),
    },
    sourceRefs: refs,
    observedAt,
  };

  return Object.freeze({
    kind: 'fcr/world-observation-receipt',
    id: text(input.id, 180) || `world-observation-${platform}-${experimentId}-${now.getTime()}`,
    ...identity,
    observationHash: sha(identity),
    recordedAt: now.toISOString(),
    authority: authorityCopy(),
  });
}

function buildFacebookWorldObservation(input = {}, now = new Date()) {
  return buildWorldObservationReceipt({ ...input, platform: 'facebook' }, now);
}

function validateWorldObservationReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') return { valid: false, errors: ['World observation must be an object'] };
  if (receipt.schema !== WORLD_OBSERVATION_SCHEMA) errors.push('Unsupported world observation schema');
  if (receipt.kind !== 'fcr/world-observation-receipt') errors.push('Unsupported world observation kind');
  if (!text(receipt.id, 180) || !text(receipt.experimentId, 180) || !text(receipt.contentId, 180)) errors.push('Missing world observation identity');
  if (!Array.isArray(receipt.sourceRefs) || receipt.sourceRefs.length === 0) errors.push('Missing source receipts');
  if (!/^[0-9a-f]{64}$/.test(String(receipt.observationHash || ''))) errors.push('Invalid observation hash');
  if (!ASSESSMENTS.has(receipt.assessments?.platform) || !ASSESSMENTS.has(receipt.assessments?.founder)) errors.push('Invalid success assessment');
  if (receipt.authority?.scope !== 'evidence-only' || receipt.authority?.permitsExecution !== false || receipt.authority?.permitsPublishing !== false || receipt.authority?.permitsAuthorityTransfer !== false) errors.push('Observation authority must remain evidence-only');
  return { valid: errors.length === 0, errors };
}

module.exports = {
  WORLD_OBSERVATION_SCHEMA,
  buildFacebookWorldObservation,
  buildWorldObservationReceipt,
  validateWorldObservationReceipt,
};
