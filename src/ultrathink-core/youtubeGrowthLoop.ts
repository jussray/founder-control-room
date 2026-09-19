export type YouTubeGrowthPhase = 'TEST_AND_VALIDATE' | 'DOUBLE_DOWN' | 'SCALE';

export type YouTubeMetricKey =
  | 'impressions'
  | 'views'
  | 'watchTimeMinutes'
  | 'ctrPercent'
  | 'retentionPercent'
  | 'subscribersGained'
  | 'shortsViews'
  | 'shortsToLongFormViews'
  | 'leads'
  | 'revenueCents';

export type YouTubeGrowthDiagnosis =
  | 'WEAK_CTR'
  | 'WEAK_RETENTION'
  | 'IMPRESSIONS_WITH_FEW_VIEWS'
  | 'VIEWS_WITH_POOR_WATCH_TIME'
  | 'SHORTS_NOT_CONVERTING';

export interface YouTubeSuccessCriterion {
  metric: YouTubeMetricKey;
  minimum?: number;
  maximum?: number;
}

export interface YouTubeMeasurement {
  observedAt: string;
  source: string;
  evidenceRefs: readonly string[];
  metrics: Partial<Record<YouTubeMetricKey, number>>;
}

export interface YouTubeGrowthExperiment {
  id: string;
  confirmedRuns: number;
  criteria: readonly YouTubeSuccessCriterion[];
  measurement?: YouTubeMeasurement;
}

export interface YouTubeDiagnosticThresholds {
  minimumImpressionsForCtrDiagnosis?: number;
  ctrPercentFloor?: number;
  retentionPercentFloor?: number;
  minimumViewsForWatchTimeDiagnosis?: number;
  watchTimeMinutesPerViewFloor?: number;
  minimumShortsViewsForConversionDiagnosis?: number;
  shortsToLongFormConversionPercentFloor?: number;
}

export interface YouTubeGrowthLoopInput {
  day: number;
  evaluatedAt: string;
  currentPhase: YouTubeGrowthPhase;
  requestedPhase: YouTubeGrowthPhase;
  experiments: readonly YouTubeGrowthExperiment[];
  diagnosticSnapshot?: YouTubeMeasurement;
  diagnosticThresholds?: YouTubeDiagnosticThresholds;
  maxMeasurementAgeMs?: number;
  continuity?: {
    previousFingerprint?: string;
    currentFingerprint: string;
  };
  targets?: Partial<Record<YouTubeMetricKey, number>>;
}

export type YouTubeGrowthLoopReason =
  | 'invalid_day'
  | 'invalid_evaluation_time'
  | 'phase_skip_forbidden'
  | 'phase_regression_requires_explicit_new_plan'
  | 'day_gate_not_reached'
  | 'no_verified_winner'
  | 'no_repeatable_winner'
  | 'continuity_changed'
  | 'measurement_missing'
  | 'measurement_missing_provenance'
  | 'measurement_invalid_time'
  | 'measurement_future_dated'
  | 'measurement_stale'
  | 'criterion_missing_metric'
  | 'criterion_not_met';

export interface YouTubeGrowthLoopResult {
  phase: YouTubeGrowthPhase;
  requestedPhase: YouTubeGrowthPhase;
  transition: 'HOLD' | 'ADVANCE';
  reasons: readonly YouTubeGrowthLoopReason[];
  winningExperimentIds: readonly string[];
  repeatableWinningExperimentIds: readonly string[];
  diagnoses: readonly {
    kind: YouTubeGrowthDiagnosis;
    action: string;
  }[];
  targets: Partial<Record<YouTubeMetricKey, number>>;
  continuity: {
    currentFingerprint: string | null;
    predecessorInvalidated: boolean;
  };
  authority: {
    advisoryOnly: true;
    authorizesPublish: false;
    authorizesSchedule: false;
    authorizesSpend: false;
    authorizesScaleExecution: false;
    targetsAreOutcomeEvidence: false;
    continuityMarkersAuthorize: false;
  };
}

const DEFAULT_MAX_MEASUREMENT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const PHASES: readonly YouTubeGrowthPhase[] = ['TEST_AND_VALIDATE', 'DOUBLE_DOWN', 'SCALE'];

function text(value: string | undefined): string {
  return value?.trim() ?? '';
}

function finite(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function validateMeasurement(
  measurement: YouTubeMeasurement | undefined,
  evaluatedAt: number,
  maxMeasurementAgeMs: number,
): YouTubeGrowthLoopReason[] {
  if (!measurement) return ['measurement_missing'];
  if (!text(measurement.source) || !measurement.evidenceRefs.some((ref) => text(ref))) {
    return ['measurement_missing_provenance'];
  }

  const observedAt = Date.parse(measurement.observedAt);
  if (!Number.isFinite(observedAt)) return ['measurement_invalid_time'];
  if (observedAt > evaluatedAt) return ['measurement_future_dated'];
  if (evaluatedAt - observedAt > maxMeasurementAgeMs) return ['measurement_stale'];
  return [];
}

function criterionReasons(
  experiment: YouTubeGrowthExperiment,
  evaluatedAt: number,
  maxMeasurementAgeMs: number,
): YouTubeGrowthLoopReason[] {
  const reasons = validateMeasurement(experiment.measurement, evaluatedAt, maxMeasurementAgeMs);
  if (reasons.length > 0) return reasons;
  if (experiment.criteria.length === 0) return ['criterion_not_met'];

  for (const criterion of experiment.criteria) {
    const value = finite(experiment.measurement?.metrics[criterion.metric]);
    if (value === undefined) reasons.push('criterion_missing_metric');
    if (value !== undefined && criterion.minimum !== undefined && value < criterion.minimum) {
      reasons.push('criterion_not_met');
    }
    if (value !== undefined && criterion.maximum !== undefined && value > criterion.maximum) {
      reasons.push('criterion_not_met');
    }
  }
  return [...new Set(reasons)];
}

function diagnostics(
  snapshot: YouTubeMeasurement | undefined,
  thresholds: YouTubeDiagnosticThresholds | undefined,
  evaluatedAt: number,
  maxMeasurementAgeMs: number,
): YouTubeGrowthLoopResult['diagnoses'] {
  if (!snapshot || !thresholds) return [];
  if (validateMeasurement(snapshot, evaluatedAt, maxMeasurementAgeMs).length > 0) return [];

  const output: Array<{ kind: YouTubeGrowthDiagnosis; action: string }> = [];
  const metrics = snapshot.metrics;
  const impressions = finite(metrics.impressions);
  const views = finite(metrics.views);
  const ctr = finite(metrics.ctrPercent);
  const retention = finite(metrics.retentionPercent);
  const watchTimeMinutes = finite(metrics.watchTimeMinutes);
  const shortsViews = finite(metrics.shortsViews);
  const shortsToLongFormViews = finite(metrics.shortsToLongFormViews);

  if (
    ctr !== undefined
    && thresholds.ctrPercentFloor !== undefined
    && ctr < thresholds.ctrPercentFloor
  ) {
    output.push({
      kind: 'WEAK_CTR',
      action: 'Inspect title-thumbnail promise, search/viewer intent match, and traffic-source impressions; change packaging before changing the whole topic.',
    });
  }

  if (
    retention !== undefined
    && thresholds.retentionPercentFloor !== undefined
    && retention < thresholds.retentionPercentFloor
  ) {
    output.push({
      kind: 'WEAK_RETENTION',
      action: 'Inspect the opening drop-off and major exit points; tighten the first promise, remove setup that delays payoff, and repair only the failing retention beats.',
    });
  }

  if (
    impressions !== undefined
    && impressions >= (thresholds.minimumImpressionsForCtrDiagnosis ?? Number.POSITIVE_INFINITY)
    && ctr !== undefined
    && thresholds.ctrPercentFloor !== undefined
    && ctr < thresholds.ctrPercentFloor
  ) {
    output.push({
      kind: 'IMPRESSIONS_WITH_FEW_VIEWS',
      action: 'Treat distribution as present but packaging as unproven; compare title-thumbnail variants and audience intent before requesting more reach.',
    });
  }

  if (
    views !== undefined
    && views >= (thresholds.minimumViewsForWatchTimeDiagnosis ?? Number.POSITIVE_INFINITY)
    && watchTimeMinutes !== undefined
    && thresholds.watchTimeMinutesPerViewFloor !== undefined
    && watchTimeMinutes / Math.max(views, 1) < thresholds.watchTimeMinutesPerViewFloor
  ) {
    output.push({
      kind: 'VIEWS_WITH_POOR_WATCH_TIME',
      action: 'Inspect whether the video delivers the title promise early, then shorten or reorder low-value sections and strengthen proof/examples around the first major drop-off.',
    });
  }

  if (
    shortsViews !== undefined
    && shortsViews >= (thresholds.minimumShortsViewsForConversionDiagnosis ?? Number.POSITIVE_INFINITY)
    && shortsToLongFormViews !== undefined
    && thresholds.shortsToLongFormConversionPercentFloor !== undefined
    && ((shortsToLongFormViews / Math.max(shortsViews, 1)) * 100) < thresholds.shortsToLongFormConversionPercentFloor
  ) {
    output.push({
      kind: 'SHORTS_NOT_CONVERTING',
      action: 'Make the Short an unresolved slice of the same long-form promise, point to one specific continuation, and verify conversion from the exact linked Short instead of counting Short views as long-form demand.',
    });
  }

  return output;
}

/**
 * Evaluate the evidence gate for the 90-day YouTube growth loop.
 *
 * Calendar time chooses when a phase may be considered, never whether it has
 * been proven. Targets remain aspirations. Only fresh, sourced measurements
 * evaluated against caller-declared success criteria can produce a winner.
 * The result is advisory and cannot authorize publishing, spend, scheduling,
 * or scaling execution.
 */
export function evaluateYouTubeGrowthLoop(input: YouTubeGrowthLoopInput): YouTubeGrowthLoopResult {
  const reasons = new Set<YouTubeGrowthLoopReason>();
  const evaluatedAt = Date.parse(input.evaluatedAt);
  const maxMeasurementAgeMs = positiveFinite(
    input.maxMeasurementAgeMs,
    DEFAULT_MAX_MEASUREMENT_AGE_MS,
  );

  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 90) reasons.add('invalid_day');
  if (!Number.isFinite(evaluatedAt)) reasons.add('invalid_evaluation_time');

  const currentIndex = PHASES.indexOf(input.currentPhase);
  const requestedIndex = PHASES.indexOf(input.requestedPhase);
  if (requestedIndex > currentIndex + 1) reasons.add('phase_skip_forbidden');
  if (requestedIndex < currentIndex) reasons.add('phase_regression_requires_explicit_new_plan');

  const predecessorInvalidated = Boolean(
    text(input.continuity?.previousFingerprint)
    && text(input.continuity?.currentFingerprint)
    && input.continuity?.previousFingerprint !== input.continuity?.currentFingerprint,
  );
  if (predecessorInvalidated) reasons.add('continuity_changed');

  const winners: string[] = [];
  const repeatableWinners: string[] = [];
  if (Number.isFinite(evaluatedAt)) {
    for (const experiment of input.experiments) {
      const experimentReasons = criterionReasons(experiment, evaluatedAt, maxMeasurementAgeMs);
      if (experimentReasons.length === 0) {
        winners.push(experiment.id);
        if (Number.isInteger(experiment.confirmedRuns) && experiment.confirmedRuns >= 2) {
          repeatableWinners.push(experiment.id);
        }
      }
    }
  }

  let advance = false;
  if (currentIndex === requestedIndex && reasons.size === 0) {
    advance = false;
  } else if (requestedIndex === currentIndex + 1 && reasons.size === 0) {
    if (input.currentPhase === 'TEST_AND_VALIDATE') {
      if (input.day < 31) reasons.add('day_gate_not_reached');
      if (winners.length === 0) reasons.add('no_verified_winner');
    } else if (input.currentPhase === 'DOUBLE_DOWN') {
      if (input.day < 61) reasons.add('day_gate_not_reached');
      if (repeatableWinners.length === 0) reasons.add('no_repeatable_winner');
    }
    advance = reasons.size === 0;
  }

  return {
    phase: advance ? input.requestedPhase : input.currentPhase,
    requestedPhase: input.requestedPhase,
    transition: advance ? 'ADVANCE' : 'HOLD',
    reasons: [...reasons],
    winningExperimentIds: winners,
    repeatableWinningExperimentIds: repeatableWinners,
    diagnoses: Number.isFinite(evaluatedAt)
      ? diagnostics(input.diagnosticSnapshot, input.diagnosticThresholds, evaluatedAt, maxMeasurementAgeMs)
      : [],
    targets: { ...(input.targets ?? {}) },
    continuity: {
      currentFingerprint: text(input.continuity?.currentFingerprint) || null,
      predecessorInvalidated,
    },
    authority: {
      advisoryOnly: true,
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
      authorizesScaleExecution: false,
      targetsAreOutcomeEvidence: false,
      continuityMarkersAuthorize: false,
    },
  };
}
