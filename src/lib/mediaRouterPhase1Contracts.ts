import type { MediaRoutingRequestV1 } from './mediaRouter.js';

export type MediaTaskClassV1 = 'DETERMINISTIC_POST' | 'GENERATION' | 'UNSUPPORTED_MIXED';

const DETERMINISTIC_INTENTS = new Set([
  'assemble',
  'caption',
  'resize',
  'compose',
  'transcode',
  'overlay',
]);

export function classifyMediaTask(request: MediaRoutingRequestV1): MediaTaskClassV1 {
  if (request.type === 'mixed') return 'UNSUPPORTED_MIXED';
  if (DETERMINISTIC_INTENTS.has(request.intent)) return 'DETERMINISTIC_POST';
  return 'GENERATION';
}

export interface CostLedgerV1 {
  currency: 'USD';
  estimated: {
    generativeProviderUsd: number;
    deterministicComputeUsd: number;
    storageAndEgressUsd: number;
    humanLaborUsd: number | null;
    totalUsd: number;
  };
  reserved: {
    generativeProviderUsd: number;
    deterministicComputeUsd: number;
    totalUsd: number;
    reservationId: string | null;
  };
  actual: {
    generativeProviderUsd: number | null;
    deterministicComputeUsd: number | null;
    storageAndEgressUsd: number | null;
    humanLaborUsd: number | null;
    totalUsd: number | null;
  };
  usage: {
    providerCreditsSpent: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    generatedSeconds: number | null;
    renderCpuSeconds: number | null;
    renderGpuSeconds: number | null;
    storageBytesAdded: number | null;
    egressBytes: number | null;
  };
  accountingStatus: 'estimated' | 'settled' | 'unknown' | 'waived';
}

function finiteNonnegative(value: number | null, field: string, nullable = true): void {
  if (value === null) {
    if (!nullable) throw new Error(`${field} must be a nonnegative number`);
    return;
  }
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a nonnegative finite number`);
}

function integerNonnegative(value: number | null, field: string): void {
  finiteNonnegative(value, field);
  if (value !== null && !Number.isInteger(value)) throw new Error(`${field} must be an integer`);
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}

export function assertCostLedgerV1(ledger: CostLedgerV1): CostLedgerV1 {
  if (ledger.currency !== 'USD') throw new Error('CostLedgerV1.currency must be USD');

  finiteNonnegative(ledger.estimated.generativeProviderUsd, 'estimated.generativeProviderUsd', false);
  finiteNonnegative(ledger.estimated.deterministicComputeUsd, 'estimated.deterministicComputeUsd', false);
  finiteNonnegative(ledger.estimated.storageAndEgressUsd, 'estimated.storageAndEgressUsd', false);
  finiteNonnegative(ledger.estimated.humanLaborUsd, 'estimated.humanLaborUsd');
  finiteNonnegative(ledger.estimated.totalUsd, 'estimated.totalUsd', false);
  const estimatedTotal = ledger.estimated.generativeProviderUsd
    + ledger.estimated.deterministicComputeUsd
    + ledger.estimated.storageAndEgressUsd
    + (ledger.estimated.humanLaborUsd ?? 0);
  if (!closeEnough(estimatedTotal, ledger.estimated.totalUsd)) {
    throw new Error('estimated.totalUsd must equal the estimated component sum');
  }

  finiteNonnegative(ledger.reserved.generativeProviderUsd, 'reserved.generativeProviderUsd', false);
  finiteNonnegative(ledger.reserved.deterministicComputeUsd, 'reserved.deterministicComputeUsd', false);
  finiteNonnegative(ledger.reserved.totalUsd, 'reserved.totalUsd', false);
  if (!closeEnough(
    ledger.reserved.generativeProviderUsd + ledger.reserved.deterministicComputeUsd,
    ledger.reserved.totalUsd,
  )) throw new Error('reserved.totalUsd must equal the reserved component sum');

  finiteNonnegative(ledger.actual.generativeProviderUsd, 'actual.generativeProviderUsd');
  finiteNonnegative(ledger.actual.deterministicComputeUsd, 'actual.deterministicComputeUsd');
  finiteNonnegative(ledger.actual.storageAndEgressUsd, 'actual.storageAndEgressUsd');
  finiteNonnegative(ledger.actual.humanLaborUsd, 'actual.humanLaborUsd');
  finiteNonnegative(ledger.actual.totalUsd, 'actual.totalUsd');
  if (ledger.actual.totalUsd !== null) {
    const actualComponents = [
      ledger.actual.generativeProviderUsd,
      ledger.actual.deterministicComputeUsd,
      ledger.actual.storageAndEgressUsd,
      ledger.actual.humanLaborUsd,
    ];
    if (actualComponents.some((value) => value === null)) {
      throw new Error('actual.totalUsd cannot be settled while an actual component is unknown');
    }
    const actualTotal = actualComponents.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (!closeEnough(actualTotal, ledger.actual.totalUsd)) {
      throw new Error('actual.totalUsd must equal the actual component sum');
    }
  }

  finiteNonnegative(ledger.usage.providerCreditsSpent, 'usage.providerCreditsSpent');
  integerNonnegative(ledger.usage.inputTokens, 'usage.inputTokens');
  integerNonnegative(ledger.usage.outputTokens, 'usage.outputTokens');
  finiteNonnegative(ledger.usage.generatedSeconds, 'usage.generatedSeconds');
  finiteNonnegative(ledger.usage.renderCpuSeconds, 'usage.renderCpuSeconds');
  finiteNonnegative(ledger.usage.renderGpuSeconds, 'usage.renderGpuSeconds');
  integerNonnegative(ledger.usage.storageBytesAdded, 'usage.storageBytesAdded');
  integerNonnegative(ledger.usage.egressBytes, 'usage.egressBytes');

  if (ledger.accountingStatus === 'settled' && ledger.actual.totalUsd === null) {
    throw new Error('settled accounting requires actual.totalUsd');
  }
  return ledger;
}

export interface MediaExecutionReceiptV1 {
  receiptId: string;
  correlationId: string;
  workspaceId: string;
  projectId: string;
  requestId: string;
  routeRecommendationId: string;
  status: 'VERIFIED' | 'INFERRED' | 'FAILED' | 'BLOCKED' | 'CANCELLED' | 'TRUNCATED';
  executionKind: 'DETERMINISTIC_POST' | 'DIRECT_PROVIDER' | 'WRAPPER' | 'INTERACTIVE_HUMAN' | 'NONE';
  task: {
    type: string;
    intent: string;
    goal: string;
    promptFingerprint: string;
    referenceAssetIds: string[];
  };
  selectedRoute: {
    providerId?: string;
    modelId?: string;
    adapterVersion: string;
    routePolicyVersion: string;
    providerCatalogVersion: string;
    providerOfferFingerprint?: string;
  };
  rejectedRoutes: Array<{ providerId: string; reason: string }>;
  cost: CostLedgerV1;
  output: {
    assetIds: string[];
    outputFingerprint: string | null;
    providerTaskId: string | null;
  };
  timings: {
    requestedAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  failure?: {
    code: string;
    safeMessage: string;
    retryable: boolean;
  };
  nextBestStep: string | null;
  retryPath: string | null;
  rollbackPath: string | null;
  recommendationFingerprint: string;
  receiptFingerprint: string;
}

function required(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required`);
}

function validDate(value: string | null, field: string): void {
  if (value !== null && !Number.isFinite(Date.parse(value))) throw new Error(`${field} must be a valid datetime`);
}

export function assertMediaExecutionReceiptV1(receipt: MediaExecutionReceiptV1): MediaExecutionReceiptV1 {
  for (const [field, value] of [
    ['receiptId', receipt.receiptId],
    ['correlationId', receipt.correlationId],
    ['workspaceId', receipt.workspaceId],
    ['projectId', receipt.projectId],
    ['requestId', receipt.requestId],
    ['routeRecommendationId', receipt.routeRecommendationId],
    ['task.promptFingerprint', receipt.task.promptFingerprint],
    ['selectedRoute.adapterVersion', receipt.selectedRoute.adapterVersion],
    ['selectedRoute.routePolicyVersion', receipt.selectedRoute.routePolicyVersion],
    ['selectedRoute.providerCatalogVersion', receipt.selectedRoute.providerCatalogVersion],
    ['recommendationFingerprint', receipt.recommendationFingerprint],
    ['receiptFingerprint', receipt.receiptFingerprint],
  ] as const) required(value, field);

  assertCostLedgerV1(receipt.cost);
  validDate(receipt.timings.requestedAt, 'timings.requestedAt');
  validDate(receipt.timings.startedAt, 'timings.startedAt');
  validDate(receipt.timings.completedAt, 'timings.completedAt');

  if (receipt.status === 'FAILED' && !receipt.failure) throw new Error('FAILED receipt requires failure detail');
  if (receipt.status === 'VERIFIED' && receipt.output.assetIds.length === 0) {
    throw new Error('VERIFIED receipt requires at least one output asset');
  }
  if (receipt.executionKind === 'DIRECT_PROVIDER' && (!receipt.selectedRoute.providerId || !receipt.selectedRoute.modelId)) {
    throw new Error('DIRECT_PROVIDER receipt requires providerId and modelId');
  }
  return receipt;
}

export interface VideoTimelineV1 {
  id: string;
  projectId: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  fps: 24 | 30 | 60;
  durationSeconds: number;
  tracks: Array<
    | {
        type: 'video';
        clips: Array<{
          assetId: string;
          startSeconds: number;
          durationSeconds: number;
          crop?: 'cover' | 'contain';
          transform?: { scale?: number; x?: number; y?: number };
          transitionOut?: 'cut' | 'fade' | 'dip_to_black';
        }>;
      }
    | {
        type: 'audio';
        clips: Array<{
          assetId: string;
          startSeconds: number;
          gainDb?: number;
          fadeInSeconds?: number;
          fadeOutSeconds?: number;
        }>;
      }
    | {
        type: 'caption';
        cues: Array<{ startSeconds: number; endSeconds: number; text: string; styleToken: string }>;
      }
    | {
        type: 'overlay';
        elements: Array<{
          startSeconds: number;
          endSeconds: number;
          kind: 'logo' | 'cta' | 'title' | 'lower_third';
          payload: Record<string, unknown>;
        }>;
      }
  >;
  sourceAssetIds: string[];
  createdFromRequestId: string;
}

function assertBoundedRange(start: number, end: number, duration: number, field: string): void {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) {
    throw new Error(`${field} must have 0 <= start < end`);
  }
  if (end > duration + 1e-9) throw new Error(`${field} exceeds timeline duration`);
}

export function assertVideoTimelineV1(timeline: VideoTimelineV1): VideoTimelineV1 {
  required(timeline.id, 'VideoTimelineV1.id');
  required(timeline.projectId, 'VideoTimelineV1.projectId');
  required(timeline.createdFromRequestId, 'VideoTimelineV1.createdFromRequestId');
  if (!Number.isFinite(timeline.durationSeconds) || timeline.durationSeconds <= 0) {
    throw new Error('VideoTimelineV1.durationSeconds must be positive');
  }
  const sources = new Set(timeline.sourceAssetIds);
  for (const track of timeline.tracks) {
    if (track.type === 'video') {
      for (const clip of track.clips) {
        required(clip.assetId, 'video.clip.assetId');
        if (!sources.has(clip.assetId)) throw new Error(`video clip ${clip.assetId} is missing from sourceAssetIds`);
        assertBoundedRange(clip.startSeconds, clip.startSeconds + clip.durationSeconds, timeline.durationSeconds, `video clip ${clip.assetId}`);
        if (clip.transform?.scale !== undefined && clip.transform.scale <= 0) throw new Error('video transform.scale must be positive');
      }
    } else if (track.type === 'audio') {
      for (const clip of track.clips) {
        required(clip.assetId, 'audio.clip.assetId');
        if (!sources.has(clip.assetId)) throw new Error(`audio clip ${clip.assetId} is missing from sourceAssetIds`);
        finiteNonnegative(clip.startSeconds, `audio clip ${clip.assetId}.startSeconds`, false);
        if (clip.startSeconds > timeline.durationSeconds) throw new Error(`audio clip ${clip.assetId} starts after timeline duration`);
        if (clip.fadeInSeconds !== undefined) finiteNonnegative(clip.fadeInSeconds, 'audio.fadeInSeconds', false);
        if (clip.fadeOutSeconds !== undefined) finiteNonnegative(clip.fadeOutSeconds, 'audio.fadeOutSeconds', false);
      }
    } else if (track.type === 'caption') {
      for (const cue of track.cues) {
        required(cue.text, 'caption.text');
        required(cue.styleToken, 'caption.styleToken');
        assertBoundedRange(cue.startSeconds, cue.endSeconds, timeline.durationSeconds, 'caption cue');
      }
    } else {
      for (const element of track.elements) {
        assertBoundedRange(element.startSeconds, element.endSeconds, timeline.durationSeconds, `overlay ${element.kind}`);
      }
    }
  }
  return timeline;
}
