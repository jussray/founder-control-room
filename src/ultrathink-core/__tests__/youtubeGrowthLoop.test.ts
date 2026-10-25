import { describe, expect, it } from 'vitest';
import {
  evaluateYouTubeGrowthLoop,
  type YouTubeGrowthExperiment,
  type YouTubeMeasurement,
} from '../youtubeGrowthLoop.js';

const NOW = '2026-09-19T16:00:00.000Z';

function measurement(overrides: Partial<YouTubeMeasurement> = {}): YouTubeMeasurement {
  return {
    observedAt: '2026-09-19T15:00:00.000Z',
    source: 'youtube-native',
    evidenceRefs: ['youtube:video:abc123'],
    metrics: {
      impressions: 10_000,
      views: 900,
      watchTimeMinutes: 4_500,
      ctrPercent: 9,
      retentionPercent: 58,
      subscribersGained: 42,
      shortsViews: 5_000,
      shortsToLongFormViews: 250,
    },
    ...overrides,
  };
}

function experiment(overrides: Partial<YouTubeGrowthExperiment> = {}): YouTubeGrowthExperiment {
  return {
    id: 'experiment-a',
    confirmedRunEvidenceRefs: ['youtube:run:1'],
    criteria: [
      { metric: 'ctrPercent', minimum: 6 },
      { metric: 'retentionPercent', minimum: 45 },
    ],
    measurement: measurement(),
    ...overrides,
  };
}

describe('evaluateYouTubeGrowthLoop', () => {
  it('does not leave test-and-validate merely because day 31 arrived', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 31,
      evaluatedAt: NOW,
      currentPhase: 'TEST_AND_VALIDATE',
      requestedPhase: 'DOUBLE_DOWN',
      experiments: [experiment({
        measurement: measurement({ metrics: { ctrPercent: 3, retentionPercent: 30 } }),
      })],
      targets: { views: 10_000, subscribersGained: 500 },
    });

    expect(result.transition).toBe('HOLD');
    expect(result.phase).toBe('TEST_AND_VALIDATE');
    expect(result.reasons).toContain('no_verified_winner');
    expect(result.experimentFailures[0]?.reasons).toContain('criterion_not_met');
    expect(result.authority.targetsAreOutcomeEvidence).toBe(false);
  });

  it('allows double-down only after day 30 with a fresh sourced winner', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 31,
      evaluatedAt: NOW,
      currentPhase: 'TEST_AND_VALIDATE',
      requestedPhase: 'DOUBLE_DOWN',
      experiments: [experiment()],
    });

    expect(result.transition).toBe('ADVANCE');
    expect(result.phase).toBe('DOUBLE_DOWN');
    expect(result.winningExperimentIds).toEqual(['experiment-a']);
  });

  it('refuses scale when repeatability has fewer than two distinct run receipts', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 61,
      evaluatedAt: NOW,
      currentPhase: 'DOUBLE_DOWN',
      requestedPhase: 'SCALE',
      experiments: [experiment({ confirmedRunEvidenceRefs: ['youtube:run:1', 'youtube:run:1'] })],
    });

    expect(result.transition).toBe('HOLD');
    expect(result.phase).toBe('DOUBLE_DOWN');
    expect(result.reasons).toContain('no_repeatable_winner');
    expect(result.experimentFailures).toEqual([{
      experimentId: 'experiment-a',
      reasons: ['repeatability_missing_evidence'],
    }]);
  });

  it('allows scale after day 60 only when success is fresh, sourced, and repeatability has two receipts', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 61,
      evaluatedAt: NOW,
      currentPhase: 'DOUBLE_DOWN',
      requestedPhase: 'SCALE',
      experiments: [experiment({
        confirmedRunEvidenceRefs: ['youtube:run:1', 'youtube:run:2'],
      })],
    });

    expect(result.transition).toBe('ADVANCE');
    expect(result.phase).toBe('SCALE');
    expect(result.repeatableWinningExperimentIds).toEqual(['experiment-a']);
    expect(result.authority.authorizesScaleExecution).toBe(false);
  });

  it('rejects stale or unattributed measurements as phase proof and keeps their receipts separate', () => {
    const stale = experiment({
      id: 'stale',
      confirmedRunEvidenceRefs: ['youtube:stale:1', 'youtube:stale:2'],
      measurement: measurement({ observedAt: '2026-08-01T00:00:00.000Z' }),
    });
    const unattributed = experiment({
      id: 'unattributed',
      confirmedRunEvidenceRefs: ['youtube:unknown:1', 'youtube:unknown:2'],
      measurement: measurement({ source: '', evidenceRefs: [] }),
    });

    const result = evaluateYouTubeGrowthLoop({
      day: 61,
      evaluatedAt: NOW,
      currentPhase: 'DOUBLE_DOWN',
      requestedPhase: 'SCALE',
      experiments: [stale, unattributed],
    });

    expect(result.transition).toBe('HOLD');
    expect(result.winningExperimentIds).toEqual([]);
    expect(result.reasons).toContain('no_repeatable_winner');
    expect(result.experimentFailures).toEqual([
      { experimentId: 'stale', reasons: ['measurement_stale'] },
      { experimentId: 'unattributed', reasons: ['measurement_missing_provenance'] },
    ]);
  });

  it('rejects non-finite and reversed criteria instead of silently manufacturing a winner', () => {
    const invalidThreshold = experiment({
      id: 'nan-threshold',
      criteria: [{ metric: 'ctrPercent', minimum: Number.NaN }],
    });
    const reversed = experiment({
      id: 'reversed-range',
      criteria: [{ metric: 'retentionPercent', minimum: 80, maximum: 40 }],
    });

    const result = evaluateYouTubeGrowthLoop({
      day: 31,
      evaluatedAt: NOW,
      currentPhase: 'TEST_AND_VALIDATE',
      requestedPhase: 'DOUBLE_DOWN',
      experiments: [invalidThreshold, reversed],
    });

    expect(result.transition).toBe('HOLD');
    expect(result.winningExperimentIds).toEqual([]);
    expect(result.experimentFailures).toEqual([
      { experimentId: 'nan-threshold', reasons: ['criterion_invalid_threshold'] },
      { experimentId: 'reversed-range', reasons: ['criterion_invalid_range'] },
    ]);
  });

  it('invalidates predecessor continuity when the bound subject fingerprint changes', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 31,
      evaluatedAt: NOW,
      currentPhase: 'TEST_AND_VALIDATE',
      requestedPhase: 'DOUBLE_DOWN',
      experiments: [experiment()],
      continuity: {
        previousFingerprint: 'channel-plan@old',
        currentFingerprint: 'channel-plan@new',
      },
    });

    expect(result.transition).toBe('HOLD');
    expect(result.reasons).toContain('continuity_changed');
    expect(result.continuity.predecessorInvalidated).toBe(true);
    expect(result.authority.continuityMarkersAuthorize).toBe(false);
  });

  it('diagnoses packaging, retention, watch-time, and Shorts conversion from verified measurements', () => {
    const snapshot = measurement({
      metrics: {
        impressions: 20_000,
        views: 700,
        ctrPercent: 3.5,
        retentionPercent: 28,
        watchTimeMinutes: 700,
        shortsViews: 10_000,
        shortsToLongFormViews: 50,
      },
    });

    const result = evaluateYouTubeGrowthLoop({
      day: 20,
      evaluatedAt: NOW,
      currentPhase: 'TEST_AND_VALIDATE',
      requestedPhase: 'TEST_AND_VALIDATE',
      experiments: [],
      diagnosticSnapshot: snapshot,
      diagnosticThresholds: {
        minimumImpressionsForCtrDiagnosis: 1_000,
        ctrPercentFloor: 5,
        retentionPercentFloor: 40,
        minimumViewsForWatchTimeDiagnosis: 500,
        watchTimeMinutesPerViewFloor: 2,
        minimumShortsViewsForConversionDiagnosis: 1_000,
        shortsToLongFormConversionPercentFloor: 2,
      },
    });

    expect(result.diagnoses.map((item) => item.kind)).toEqual([
      'WEAK_CTR',
      'WEAK_RETENTION',
      'IMPRESSIONS_WITH_FEW_VIEWS',
      'VIEWS_WITH_POOR_WATCH_TIME',
      'SHORTS_NOT_CONVERTING',
    ]);
  });

  it('binds the growth loop to LEEVIZE and keeps monetization claims evidence-gated', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 20,
      evaluatedAt: NOW,
      currentPhase: 'TEST_AND_VALIDATE',
      requestedPhase: 'TEST_AND_VALIDATE',
      experiments: [],
    });

    expect(result.workflow).toContain('LEEVIZE');
    expect(result.workflow).toContain('measure');
    expect(result.monetizationTruth).toEqual({
      yppEligibilityRequiresProviderEvidence: true,
      affiliateOrSponsorIntentIsNotRevenue: true,
      revenueRequiresOutcomeEvidence: true,
    });
  });

  it('never treats the advisory result as publish, schedule, spend, or scale authority', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 31,
      evaluatedAt: NOW,
      currentPhase: 'TEST_AND_VALIDATE',
      requestedPhase: 'DOUBLE_DOWN',
      experiments: [experiment()],
    });

    expect(result.authority).toEqual({
      advisoryOnly: true,
      authorizesPublish: false,
      authorizesSchedule: false,
      authorizesSpend: false,
      authorizesScaleExecution: false,
      targetsAreOutcomeEvidence: false,
      continuityMarkersAuthorize: false,
    });
  });
});
