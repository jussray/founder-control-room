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

export type TrendRadarReason =
  | 'missing_evidence'
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
  authority: {
    authorizesPublish: false;
    authorizesSchedule: false;
    authorizesSpend: false;
  };
}

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

function normalized(value: string): string {
  return value.trim();
}

function hasEvidence(candidate: TrendRadarCandidate): boolean {
  return candidate.evidenceRefs.some((ref) => normalized(ref.id).length > 0);
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

function classifyReasons(candidate: TrendRadarCandidate): TrendRadarReason[] {
  const reasons: TrendRadarReason[] = [];
  if (!hasEvidence(candidate)) reasons.push('missing_evidence');
  if (candidate.evidenceState === 'PREDICTION') reasons.push('prediction_only');
  if (!hasRequiredAngles(candidate)) reasons.push('missing_required_angles');
  if (candidate.fingerprint && boundedScore(candidate.fingerprint.similarity) >= 85) {
    reasons.push('near_duplicate_fingerprint');
  }
  if (candidate.saturation === 'CROWDED') reasons.push('crowded');
  if (candidate.saturation === 'OVERSATURATED') reasons.push('oversaturated');
  if (candidate.saturation === 'UNKNOWN') reasons.push('unknown_saturation');
  return reasons;
}

function duplicatePenalty(candidate: TrendRadarCandidate): number {
  return candidate.fingerprint && boundedScore(candidate.fingerprint.similarity) >= 85
    ? 20
    : 0;
}

function rankCandidate(candidate: TrendRadarCandidate): RankedTrendRadarCandidate {
  const reasons = classifyReasons(candidate);
  const raw = weightedOpportunity(candidate.scores) * EVIDENCE_FACTOR[candidate.evidenceState];
  const score = Math.max(
    0,
    raw - SATURATION_PENALTY[candidate.saturation] - duplicatePenalty(candidate),
  );
  const blockingReasons: readonly TrendRadarReason[] = [
    'missing_evidence',
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
 * The radar separates observation from prediction, penalizes saturation and
 * repeated content fingerprints, and gives explicit weight to founder receipts
 * and the closest legitimate revenue path. Ranking is advisory only: it never
 * grants publish, scheduling, spend, or provider authority.
 */
export function evaluateContentTrendRadar(
  candidates: readonly TrendRadarCandidate[],
  firstWaveLimit = 3,
): TrendRadarResult {
  const ranked = candidates
    .map(rankCandidate)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const safeLimit = Number.isInteger(firstWaveLimit) && firstWaveLimit > 0
    ? firstWaveLimit
    : 3;

  return {
    ranked,
    firstWave: ranked.filter((candidate) => candidate.eligibleForFirstWave).slice(0, safeLimit),
    authority: {
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
    },
  };
}
