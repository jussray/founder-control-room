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
    confirmedRuns: 1,
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

  it('refuses scale when a winner has not repeated', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 61,
      evaluatedAt: NOW,
      currentPhase: 'DOUBLE_DOWN',
      requestedPhase: 'SCALE',
      experiments: [experiment({ confirmedRuns: 1 })],
    });

    expect(result.transition).toBe('HOLD');
    expect(result.phase).toBe('DOUBLE_DOWN');
    expect(result.reasons).toContain('no_repeatable_winner');
  });

  it('allows scale after day 60 only when success is fresh, sourced, and repeated', () => {
    const result = evaluateYouTubeGrowthLoop({
      day: 61,
      evaluatedAt: NOW,
      currentPhase: 'DOUBLE_DOWN',
      requestedPhase: 'SCALE',
      experiments: [experiment({ confirmedRuns: 2 })],
    });

    expect(result.transition).toBe('ADVANCE');
    expect(result.phase).toBe('SCALE');
    expect(result.repeatableWinningExperimentIds).toEqual(['experiment-a']);
    expect(result.authority.authorizesScaleExecution).toBe(false);
  });

  it('rejects stale or unattributed measurements as phase proof', () => {
    const stale = experiment({
      id: 'stale',
      confirmedRuns: 3,
      measurement: measurement({ observedAt: '2026-08-01T00:00:00.000Z' }),
    });
    const unattributed = experiment({
      id: 'unattributed',
      confirmedRuns: 3,
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
