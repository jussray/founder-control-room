export type TrendEvidenceState =
  | 'VERIFIED'
  | 'EMERGING_SIGNAL'
  | 'INFERENCE'
  | 'PREDICTION';

export type TrendSaturation =
  | 'EARLY'
  | 'RISING'
  | 'CROWDED'
  | 'OVERSATURATED'
  | 'UNKNOWN';

export type TrendAngleKind = 'CONTRARIAN' | 'PRACTICAL' | 'FUTURE';

export interface TrendEvidenceRef {
  id: string;
  source?: string;
  observedAt?: string;
}

export interface TrendContentAngle {
  kind: TrendAngleKind;
  thesis: string;
}

export interface TrendRadarScores {
  timeliness: number;
  audienceInterest: number;
  contentPotential: number;
  founderFit: number;
  revenueRelevance: number;
  competitionOpportunity: number;
}

export interface TrendFingerprintComparison {
  fingerprintId: string;
  similarity: number;
}

export interface TrendRadarCandidate {
  id: string;
  trend: string;
  evidenceState: TrendEvidenceState;
  evidenceRefs: readonly TrendEvidenceRef[];
  saturation: TrendSaturation;
  scores: TrendRadarScores;
  angles: readonly TrendContentAngle[];
  fingerprint?: TrendFingerprintComparison;
}

export interface TrendRadarEvaluationContext {
  evaluatedAt: string;
  maxEvidenceAgeMs?: number;
  futureSkewMs?: number;
  firstWaveLimit?: number;
}

export type TrendRadarReason =
  | 'missing_evidence'
  | 'missing_evidence_provenance'
  | 'invalid_evidence_time'
  | 'stale_evidence'
  | 'future_evidence'
  | 'invalid_evaluation_time'
  | 'prediction_only'
  | 'missing_required_angles'
  | 'near_duplicate_fingerprint'
  | 'crowded'
  | 'oversaturated'
  | 'unknown_saturation';

export interface RankedTrendRadarCandidate extends TrendRadarCandidate {
  score: number;
  eligibleForFirstWave: boolean;
  reasons: readonly TrendRadarReason[];
}

export interface TrendRadarResult {
  ranked: readonly RankedTrendRadarCandidate[];
  firstWave: readonly RankedTrendRadarCandidate[];
  evaluatedAt: string;
  authority: {
    authorizesPublish: false;
    authorizesSchedule: false;
    authorizesSpend: false;
  };
}

const DEFAULT_MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_FUTURE_SKEW_MS = 2 * 60 * 1000;
const EVIDENCE_FACTOR: Readonly<Record<TrendEvidenceState, number>> = {
  VERIFIED: 1,
  EMERGING_SIGNAL: 0.95,
  INFERENCE: 0.8,
  PREDICTION: 0.6,
};

const SATURATION_PENALTY: Readonly<Record<TrendSaturation, number>> = {
  EARLY: 0,
  RISING: 5,
  CROWDED: 15,
  OVERSATURATED: 25,
  UNKNOWN: 10,
};

const REQUIRED_ANGLES: readonly TrendAngleKind[] = [
  'CONTRARIAN',
  'PRACTICAL',
  'FUTURE',
];

function boundedScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function normalized(value: string | undefined): string {
  return value?.trim() ?? '';
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasEvidence(candidate: TrendRadarCandidate): boolean {
  return candidate.evidenceRefs.some((ref) => normalized(ref.id).length > 0);
}

function evidenceProvenanceReasons(
  candidate: TrendRadarCandidate,
  context: TrendRadarEvaluationContext,
): TrendRadarReason[] {
  if (!hasEvidence(candidate)) return ['missing_evidence'];

  const evaluatedAt = Date.parse(context.evaluatedAt);
  if (!Number.isFinite(evaluatedAt)) return ['invalid_evaluation_time'];

  const maxEvidenceAgeMs = positiveFinite(
    context.maxEvidenceAgeMs,
    DEFAULT_MAX_EVIDENCE_AGE_MS,
  );
  const futureSkewMs = Math.min(
    positiveFinite(context.futureSkewMs, DEFAULT_FUTURE_SKEW_MS),
    DEFAULT_FUTURE_SKEW_MS,
  );
  const reasons = new Set<TrendRadarReason>();
  let hasCurrentProvenance = false;

  for (const ref of candidate.evidenceRefs) {
    if (!normalized(ref.id)) continue;
    if (!normalized(ref.source) || !normalized(ref.observedAt)) {
      reasons.add('missing_evidence_provenance');
      continue;
    }

    const observedAt = Date.parse(ref.observedAt!);
    if (!Number.isFinite(observedAt)) {
      reasons.add('invalid_evidence_time');
      continue;
    }
    if (observedAt > evaluatedAt + futureSkewMs) {
      reasons.add('future_evidence');
      continue;
    }
    if (evaluatedAt - observedAt > maxEvidenceAgeMs) {
      reasons.add('stale_evidence');
      continue;
    }

    hasCurrentProvenance = true;
  }

  if (hasCurrentProvenance) {
    reasons.delete('missing_evidence_provenance');
    reasons.delete('invalid_evidence_time');
    reasons.delete('stale_evidence');
    reasons.delete('future_evidence');
  }

  return [...reasons];
}

function hasRequiredAngles(candidate: TrendRadarCandidate): boolean {
  const available = new Set(
    candidate.angles
      .filter((angle) => normalized(angle.thesis).length > 0)
      .map((angle) => angle.kind),
  );
  return REQUIRED_ANGLES.every((kind) => available.has(kind));
}

function weightedOpportunity(scores: TrendRadarScores): number {
  return (
    boundedScore(scores.timeliness) * 0.25
    + boundedScore(scores.audienceInterest) * 0.2
    + boundedScore(scores.contentPotential) * 0.2
    + boundedScore(scores.founderFit) * 0.15
    + boundedScore(scores.revenueRelevance) * 0.15
    + boundedScore(scores.competitionOpportunity) * 0.05
  );
}

function classifyReasons(
  candidate: TrendRadarCandidate,
  context: TrendRadarEvaluationContext,
): TrendRadarReason[] {
  const reasons = evidenceProvenanceReasons(candidate, context);
  if (candidate.evidenceState === 'PREDICTION') reasons.push('prediction_only');
  if (!hasRequiredAngles(candidate)) reasons.push('missing_required_angles');
  if (candidate.fingerprint && boundedScore(candidate.fingerprint.similarity) >= 85) {
    reasons.push('near_duplicate_fingerprint');
  }
  if (candidate.saturation === 'CROWDED') reasons.push('crowded');
  if (candidate.saturation === 'OVERSATURATED') reasons.push('oversaturated');
  if (candidate.saturation === 'UNKNOWN') reasons.push('unknown_saturation');
  return [...new Set(reasons)];
}

function duplicatePenalty(candidate: TrendRadarCandidate): number {
  return candidate.fingerprint && boundedScore(candidate.fingerprint.similarity) >= 85
    ? 20
    : 0;
}

function rankCandidate(
  candidate: TrendRadarCandidate,
  context: TrendRadarEvaluationContext,
): RankedTrendRadarCandidate {
  const reasons = classifyReasons(candidate, context);
  const raw = weightedOpportunity(candidate.scores) * EVIDENCE_FACTOR[candidate.evidenceState];
  const score = Math.max(
    0,
    raw - SATURATION_PENALTY[candidate.saturation] - duplicatePenalty(candidate),
  );
  const blockingReasons: readonly TrendRadarReason[] = [
    'missing_evidence',
    'missing_evidence_provenance',
    'invalid_evidence_time',
    'stale_evidence',
    'future_evidence',
    'invalid_evaluation_time',
    'prediction_only',
    'missing_required_angles',
  ];

  return {
    ...candidate,
    score: Number(score.toFixed(2)),
    eligibleForFirstWave: !reasons.some((reason) => blockingReasons.includes(reason)),
    reasons,
  };
}

/**
 * Rank content opportunities from sourced market signals.
 *
 * First-wave eligibility requires current provenance evaluated at an explicit
 * time boundary. A caller-provided VERIFIED/EMERGING label cannot make stale,
 * unattributed, malformed, or future-dated evidence current. The radar remains
 * advisory only: it never grants publish, scheduling, spend, or provider authority.
 */
export function evaluateContentTrendRadar(
  candidates: readonly TrendRadarCandidate[],
  context: TrendRadarEvaluationContext,
): TrendRadarResult {
  const ranked = candidates
    .map((candidate) => rankCandidate(candidate, context))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const safeLimit = Number.isInteger(context.firstWaveLimit) && (context.firstWaveLimit ?? 0) > 0
    ? context.firstWaveLimit!
    : 3;

  return {
    ranked,
    firstWave: ranked.filter((candidate) => candidate.eligibleForFirstWave).slice(0, safeLimit),
    evaluatedAt: context.evaluatedAt,
    authority: {
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
    },
  };
}
