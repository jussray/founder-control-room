import { describe, expect, it } from 'vitest';

import type { MediaRoutingRequestV1 } from '../mediaRouter.js';
import {
  assertCostLedgerV1,
  assertMediaExecutionReceiptV1,
  assertVideoTimelineV1,
  classifyMediaTask,
  type CostLedgerV1,
  type MediaExecutionReceiptV1,
  type VideoTimelineV1,
} from '../mediaRouterPhase1Contracts.js';

const at = '2026-09-24T03:00:00.000Z';

function request(intent: MediaRoutingRequestV1['intent'], type: MediaRoutingRequestV1['type'] = 'image'): MediaRoutingRequestV1 {
  return {
    requestId: 'r1', correlationId: 'c1', workspaceId: 'w1', projectId: 'p1', requestedBy: 'u1',
    type, intent, goal: 'draft', prompt: 'x', referenceAssetIds: [],
    referencePolicy: { maySendToExternalProvider: true, mayStoreInLibrary: true, mayReuseCrossProject: false },
    output: {}, constraints: {},
    budget: { mode: 'cheap', maxCostUsd: 1, allowWrapper: false, requireDirectProviderWhenAvailable: true },
    authority: { action: 'media.generate' },
  };
}

function cost(): CostLedgerV1 {
  return {
    currency: 'USD',
    estimated: {
      generativeProviderUsd: 0.04,
      deterministicComputeUsd: 0.01,
      storageAndEgressUsd: 0.01,
      humanLaborUsd: null,
      totalUsd: 0.06,
    },
    reserved: {
      generativeProviderUsd: 0.04,
      deterministicComputeUsd: 0.01,
      totalUsd: 0.05,
      reservationId: 'res_1',
    },
    actual: {
      generativeProviderUsd: null,
      deterministicComputeUsd: null,
      storageAndEgressUsd: null,
      humanLaborUsd: null,
      totalUsd: null,
    },
    usage: {
      providerCreditsSpent: null,
      inputTokens: null,
      outputTokens: null,
      generatedSeconds: null,
      renderCpuSeconds: null,
      renderGpuSeconds: null,
      storageBytesAdded: null,
      egressBytes: null,
    },
    accountingStatus: 'estimated',
  };
}

describe('task classifier', () => {
  it('keeps edit/generation work out of deterministic post', () => {
    expect(classifyMediaTask(request('edit'))).toBe('GENERATION');
    expect(classifyMediaTask(request('motion_proof', 'video'))).toBe('GENERATION');
  });

  it('classifies compose/transcode/overlay as deterministic post', () => {
    for (const intent of ['compose', 'transcode', 'overlay', 'assemble', 'caption', 'resize'] as const) {
      expect(classifyMediaTask(request(intent, 'post'))).toBe('DETERMINISTIC_POST');
    }
  });

  it('makes mixed work explicit instead of guessing', () => {
    expect(classifyMediaTask(request('generate', 'mixed'))).toBe('UNSUPPORTED_MIXED');
  });
});

describe('cost ledger', () => {
  it('accepts internally consistent estimates', () => {
    expect(assertCostLedgerV1(cost()).estimated.totalUsd).toBe(0.06);
  });

  it('rejects mismatched totals', () => {
    const broken = cost();
    broken.estimated.totalUsd = 0.5;
    expect(() => assertCostLedgerV1(broken)).toThrow(/estimated\.totalUsd/);
  });

  it('does not call accounting settled while actuals are unknown', () => {
    const broken = cost();
    broken.accountingStatus = 'settled';
    expect(() => assertCostLedgerV1(broken)).toThrow(/settled accounting/);
  });
});

describe('execution receipt', () => {
  it('requires provider/model identity for a direct-provider receipt', () => {
    const receipt: MediaExecutionReceiptV1 = {
      receiptId: 'receipt_1', correlationId: 'c1', workspaceId: 'w1', projectId: 'p1', requestId: 'r1', routeRecommendationId: 'rec1',
      status: 'VERIFIED', executionKind: 'DIRECT_PROVIDER',
      task: { type: 'image', intent: 'generate', goal: 'draft', promptFingerprint: 'prompt_hash', referenceAssetIds: [] },
      selectedRoute: { adapterVersion: '1', routePolicyVersion: '1', providerCatalogVersion: '1' },
      rejectedRoutes: [], cost: cost(),
      output: { assetIds: ['a1'], outputFingerprint: 'out_hash', providerTaskId: 'provider_task_1' },
      timings: { requestedAt: at, startedAt: at, completedAt: at },
      nextBestStep: null, retryPath: null, rollbackPath: null,
      recommendationFingerprint: 'rec_hash', receiptFingerprint: 'receipt_hash',
    };
    expect(() => assertMediaExecutionReceiptV1(receipt)).toThrow(/providerId and modelId/);
    receipt.selectedRoute.providerId = 'google';
    receipt.selectedRoute.modelId = 'nano-banana';
    expect(assertMediaExecutionReceiptV1(receipt).status).toBe('VERIFIED');
  });

  it('requires failure detail when status is FAILED', () => {
    const receipt: MediaExecutionReceiptV1 = {
      receiptId: 'receipt_2', correlationId: 'c1', workspaceId: 'w1', projectId: 'p1', requestId: 'r1', routeRecommendationId: 'rec1',
      status: 'FAILED', executionKind: 'NONE',
      task: { type: 'image', intent: 'generate', goal: 'draft', promptFingerprint: 'prompt_hash', referenceAssetIds: [] },
      selectedRoute: { adapterVersion: '1', routePolicyVersion: '1', providerCatalogVersion: '1' },
      rejectedRoutes: [], cost: cost(),
      output: { assetIds: [], outputFingerprint: null, providerTaskId: null },
      timings: { requestedAt: at, startedAt: at, completedAt: at },
      nextBestStep: null, retryPath: null, rollbackPath: null,
      recommendationFingerprint: 'rec_hash', receiptFingerprint: 'receipt_hash',
    };
    expect(() => assertMediaExecutionReceiptV1(receipt)).toThrow(/requires failure detail/);
  });
});

describe('video timeline', () => {
  it('accepts bounded video, audio, captions, and overlays', () => {
    const timeline: VideoTimelineV1 = {
      id: 'timeline_1', projectId: 'p1', aspectRatio: '9:16', fps: 30, durationSeconds: 10,
      sourceAssetIds: ['video_1', 'audio_1'], createdFromRequestId: 'r1',
      tracks: [
        { type: 'video', clips: [{ assetId: 'video_1', startSeconds: 0, durationSeconds: 10, transitionOut: 'fade' }] },
        { type: 'audio', clips: [{ assetId: 'audio_1', startSeconds: 0, fadeInSeconds: 0.2 }] },
        { type: 'caption', cues: [{ startSeconds: 1, endSeconds: 3, text: 'Hello', styleToken: 'caption.primary' }] },
        { type: 'overlay', elements: [{ startSeconds: 8, endSeconds: 10, kind: 'cta', payload: { text: 'Go' } }] },
      ],
    };
    expect(assertVideoTimelineV1(timeline).id).toBe('timeline_1');
  });

  it('rejects cues outside timeline bounds and clips absent from lineage', () => {
    const timeline: VideoTimelineV1 = {
      id: 'timeline_2', projectId: 'p1', aspectRatio: '16:9', fps: 24, durationSeconds: 5,
      sourceAssetIds: [], createdFromRequestId: 'r1',
      tracks: [{ type: 'video', clips: [{ assetId: 'missing', startSeconds: 0, durationSeconds: 5 }] }],
    };
    expect(() => assertVideoTimelineV1(timeline)).toThrow(/missing from sourceAssetIds/);

    timeline.sourceAssetIds = ['missing'];
    timeline.tracks = [{ type: 'caption', cues: [{ startSeconds: 4, endSeconds: 6, text: 'late', styleToken: 'x' }] }];
    expect(() => assertVideoTimelineV1(timeline)).toThrow(/exceeds timeline duration/);
  });
});
