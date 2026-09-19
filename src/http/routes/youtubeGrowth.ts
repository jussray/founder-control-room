import { Router } from 'express';
import {
  evaluateYouTubeGrowthLoop,
  type YouTubeGrowthLoopInput,
  type YouTubeGrowthPhase,
  type YouTubeMeasurement,
} from '../../ultrathink-core/youtubeGrowthLoop.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const YOUTUBE_GROWTH_EVALUATION_CONTRACT = 'fcr/youtube-growth-evaluation@v1' as const;

const YOUTUBE_GROWTH_PHASES: readonly YouTubeGrowthPhase[] = [
  'TEST_AND_VALIDATE',
  'DOUBLE_DOWN',
  'SCALE',
];

const METRIC_KEYS = new Set([
  'impressions',
  'views',
  'watchTimeMinutes',
  'ctrPercent',
  'retentionPercent',
  'subscribersGained',
  'shortsViews',
  'shortsToLongFormViews',
  'leads',
  'revenueCents',
]);

const DIAGNOSTIC_THRESHOLD_KEYS = new Set([
  'minimumImpressionsForCtrDiagnosis',
  'ctrPercentFloor',
  'retentionPercentFloor',
  'minimumViewsForWatchTimeDiagnosis',
  'watchTimeMinutesPerViewFloor',
  'minimumShortsViewsForConversionDiagnosis',
  'shortsToLongFormConversionPercentFloor',
]);

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function phase(value: unknown): YouTubeGrowthPhase | null {
  const candidate = text(value) as YouTubeGrowthPhase;
  return YOUTUBE_GROWTH_PHASES.includes(candidate) ? candidate : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function numericRecord(value: unknown, allowedKeys: ReadonlySet<string>): boolean {
  const candidate = record(value);
  if (!candidate) return false;
  return Object.entries(candidate).every(([key, metric]) => (
    allowedKeys.has(key)
    && typeof metric === 'number'
  ));
}

function metricMap(value: unknown): boolean {
  return numericRecord(value, METRIC_KEYS);
}

function diagnosticThresholds(value: unknown): boolean {
  return value === undefined || numericRecord(value, DIAGNOSTIC_THRESHOLD_KEYS);
}

function continuity(value: unknown): boolean {
  if (value === undefined) return true;
  const candidate = record(value);
  if (!candidate) return false;
  if (typeof candidate.currentFingerprint !== 'string') return false;
  if (candidate.previousFingerprint !== undefined && typeof candidate.previousFingerprint !== 'string') return false;
  return Object.keys(candidate).every((key) => (
    key === 'currentFingerprint' || key === 'previousFingerprint'
  ));
}

function measurement(value: unknown): value is YouTubeMeasurement {
  const candidate = record(value);
  if (!candidate) return false;
  return (
    typeof candidate.observedAt === 'string'
    && typeof candidate.source === 'string'
    && stringArray(candidate.evidenceRefs)
    && metricMap(candidate.metrics)
  );
}

function criterion(value: unknown): boolean {
  const candidate = record(value);
  if (!candidate || !METRIC_KEYS.has(text(candidate.metric))) return false;
  if (candidate.minimum !== undefined && typeof candidate.minimum !== 'number') return false;
  if (candidate.maximum !== undefined && typeof candidate.maximum !== 'number') return false;
  return Object.keys(candidate).every((key) => (
    key === 'metric' || key === 'minimum' || key === 'maximum'
  ));
}

function experiment(value: unknown): boolean {
  const candidate = record(value);
  if (!candidate) return false;
  if (typeof candidate.id !== 'string') return false;
  if (!stringArray(candidate.confirmedRunEvidenceRefs)) return false;
  if (!Array.isArray(candidate.criteria) || !candidate.criteria.every(criterion)) return false;
  if (candidate.measurement !== undefined && !measurement(candidate.measurement)) return false;
  return Object.keys(candidate).every((key) => (
    key === 'id'
    || key === 'confirmedRunEvidenceRefs'
    || key === 'criteria'
    || key === 'measurement'
  ));
}

function validInputShape(value: unknown): value is YouTubeGrowthLoopInput {
  const candidate = record(value);
  if (!candidate) return false;
  if (typeof candidate.day !== 'number') return false;
  if (typeof candidate.evaluatedAt !== 'string') return false;
  if (!phase(candidate.currentPhase) || !phase(candidate.requestedPhase)) return false;
  if (!Array.isArray(candidate.experiments) || !candidate.experiments.every(experiment)) return false;
  if (candidate.diagnosticSnapshot !== undefined && !measurement(candidate.diagnosticSnapshot)) return false;
  if (!diagnosticThresholds(candidate.diagnosticThresholds)) return false;
  if (!continuity(candidate.continuity)) return false;
  if (candidate.targets !== undefined && !metricMap(candidate.targets)) return false;
  if (candidate.maxMeasurementAgeMs !== undefined && typeof candidate.maxMeasurementAgeMs !== 'number') return false;
  return Object.keys(candidate).every((key) => (
    key === 'day'
    || key === 'evaluatedAt'
    || key === 'currentPhase'
    || key === 'requestedPhase'
    || key === 'experiments'
    || key === 'diagnosticSnapshot'
    || key === 'diagnosticThresholds'
    || key === 'maxMeasurementAgeMs'
    || key === 'continuity'
    || key === 'targets'
  ));
}

export const youtubeGrowthRouter = Router();
youtubeGrowthRouter.use(requireFounder);

youtubeGrowthRouter.get('/', (_req: FounderRequest, res) => res.json({
  contract: YOUTUBE_GROWTH_EVALUATION_CONTRACT,
  route: '/automation/conveyor/founder-content/youtube-growth/evaluate',
  workflow: 'LEEVIZE -> measure -> diagnose -> double-down/repair/kill',
  phases: YOUTUBE_GROWTH_PHASES,
  authority: {
    advisoryOnly: true,
    publish: false,
    schedule: false,
    spend: false,
    scaleExecution: false,
    merge: false,
    deploy: false,
  },
}));

youtubeGrowthRouter.post('/evaluate', (req: FounderRequest, res) => {
  if (!validInputShape(req.body)) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_YOUTUBE_GROWTH_EVALUATION_PAYLOAD',
      contract: YOUTUBE_GROWTH_EVALUATION_CONTRACT,
      reasons: [
        'A typed 90-day growth evaluation payload is required; malformed experiments, measurements, continuity, thresholds, or targets are rejected before core evaluation.',
      ],
    });
  }

  const result = evaluateYouTubeGrowthLoop({
    ...req.body,
    currentPhase: phase(req.body.currentPhase)!,
    requestedPhase: phase(req.body.requestedPhase)!,
  });

  return res.json({
    ok: true,
    contract: YOUTUBE_GROWTH_EVALUATION_CONTRACT,
    result,
    published: false,
    providerMutationAttempted: false,
  });
});
