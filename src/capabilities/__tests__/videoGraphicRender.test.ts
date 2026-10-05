import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dispatchVideoGraphicRender,
  prepareVideoGraphicRender,
  readVideoGraphicRenderStatus,
  VideoGraphicRenderError,
  type VideoGraphicRenderProvider,
} from '../videoGraphicRender.js';
import type { MediaRoutingRequestV1 } from '../../lib/mediaRouter.js';
import type { FfmpegTimelineSpec } from '../../lib/mediaFfmpegRender.js';

const MAIN_SHA = 'a'.repeat(40);

function mediaRequest(overrides: Partial<MediaRoutingRequestV1> = {}): MediaRoutingRequestV1 {
  return {
    requestId: 'media-request-1',
    correlationId: 'corr-1',
    workspaceId: 'workspace-1',
    projectId: 'founder-control-room',
    requestedBy: 'founder-1',
    type: 'post',
    intent: 'compose',
    goal: 'production',
    prompt: 'Render a first-party graphic title card.',
    referenceAssetIds: [],
    referencePolicy: {
      maySendToExternalProvider: false,
      mayStoreInLibrary: true,
      mayReuseCrossProject: false,
    },
    output: {
      aspectRatio: '16:9',
      width: 320,
      height: 180,
      durationSeconds: 2,
      fps: 24,
      audioRequired: false,
    },
    constraints: { needsTextAccuracy: true },
    budget: {
      mode: 'free',
      maxCostUsd: 0.1,
      allowWrapper: false,
      requireDirectProviderWhenAvailable: true,
    },
    authority: { action: 'media.generate' },
    ...overrides,
  };
}

function timeline(overrides: Partial<FfmpegTimelineSpec> = {}): FfmpegTimelineSpec {
  return {
    width: 320,
    height: 180,
    fps: 24,
    segments: [
      {
        durationSec: 2,
        background: '#101018',
        lines: [
          { text: 'FCR graphic render', sizeFrac: 0.08, yFrac: 0.5, color: '#FFFFFF', bold: true },
        ],
      },
    ],
    ...overrides,
  };
}

function provider(overrides: Partial<VideoGraphicRenderProvider> = {}) {
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const fake: VideoGraphicRenderProvider = {
    resolveMainSha: vi.fn().mockResolvedValue(MAIN_SHA),
    dispatch,
    findRun: vi.fn().mockResolvedValue(null),
    listArtifacts: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return { fake, dispatch };
}

beforeEach(() => {
  process.env.GIT_SHA = MAIN_SHA;
});

afterEach(() => {
  delete process.env.GIT_SHA;
  vi.restoreAllMocks();
});

describe('video graphic render capability', () => {
  it('binds a graphic-only timeline to deterministic FFmpeg execution without publication authority', () => {
    const plan = prepareVideoGraphicRender({ request: mediaRequest(), timeline: timeline() });

    expect(plan).toMatchObject({
      requestId: 'media-request-1',
      executionKind: 'DETERMINISTIC_POST',
      tool: 'ffmpeg',
      motionClass: 'GRAPHIC_ANIMATION',
      publishAuthority: false,
    });
    expect(plan.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.canonicalTimelineJson).toBe(JSON.stringify(JSON.parse(plan.canonicalTimelineJson)));
  });

  it('rejects storyboard/source-image inputs instead of dropping frame-zero continuity', () => {
    expect(() => prepareVideoGraphicRender({
      request: mediaRequest({ referenceAssetIds: ['opening-frame-1'] }),
      timeline: timeline(),
    })).toThrow(/does not transport source\/reference assets/);

    expect(() => prepareVideoGraphicRender({
      request: mediaRequest(),
      timeline: timeline({
        segments: [
          {
            durationSec: 2,
            background: '#101018',
            imagePath: '/tmp/opening-frame.png',
            lines: [],
          },
        ],
      }),
    })).toThrow(/does not accept imagePath/);
  });

  it('rejects local font paths and output contract drift', () => {
    expect(() => prepareVideoGraphicRender({
      request: mediaRequest(),
      timeline: { ...timeline(), fontFile: '/tmp/custom.ttf' },
    })).toThrow(/does not accept local font paths/);

    expect(() => prepareVideoGraphicRender({
      request: mediaRequest({ output: { width: 640, height: 360, fps: 24, durationSeconds: 2, aspectRatio: '16:9' } }),
      timeline: timeline(),
    })).toThrow(/output.width must match/);
  });

  it('dispatches the exact deployed-main subject with the canonical input hash', async () => {
    const { fake, dispatch } = provider();
    const result = await dispatchVideoGraphicRender({ request: mediaRequest(), timeline: timeline() }, fake);

    expect(result.state).toBe('dispatched');
    expect(result.expectedHeadSha).toBe(MAIN_SHA);
    expect(result.publishAuthority).toBe(false);
    expect(result.verification).toBe('PENDING_REMOTE_WORKFLOW');
    expect(result.invocationId).toMatch(/^video-graphic-[a-f0-9]{12}-[0-9a-f-]{36}$/);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      invocationId: result.invocationId,
      expectedHeadSha: MAIN_SHA,
      inputSha256: result.inputSha256,
      timelineJson: expect.any(String),
    }));
  });

  it('fails closed when the deployed runtime is not current main', async () => {
    const { fake, dispatch } = provider({ resolveMainSha: vi.fn().mockResolvedValue('b'.repeat(40)) });

    await expect(dispatchVideoGraphicRender({ request: mediaRequest(), timeline: timeline() }, fake))
      .rejects.toMatchObject<Partial<VideoGraphicRenderError>>({
        code: 'runtime_not_exact_main',
        status: 409,
      });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('calls a completed run verified only when its retained FCR evidence artifact exists', async () => {
    const invocationId = 'video-graphic-abcdef123456-11111111-2222-4333-8444-555555555555';
    const run = {
      id: 42,
      status: 'completed',
      conclusion: 'success',
      htmlUrl: 'https://github.com/jussray/founder-control-room/actions/runs/42',
      headSha: MAIN_SHA,
      displayTitle: `FCR video render ${invocationId}`,
    };
    const { fake } = provider({
      findRun: vi.fn().mockResolvedValue(run),
      listArtifacts: vi.fn().mockResolvedValue([
        { id: 9, name: 'fcr-video-render-42-1', expired: false },
      ]),
    });

    const status = await readVideoGraphicRenderStatus(invocationId, fake);
    expect(status.verification).toBe('WORKFLOW_AND_PLAYBACK_VERIFIED');
    expect(status.evidenceArtifact).toEqual({ id: 9, name: 'fcr-video-render-42-1', expired: false });
    expect(status.publishAuthority).toBe(false);
  });
});
