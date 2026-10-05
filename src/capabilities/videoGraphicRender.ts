import { createHash, randomUUID } from 'node:crypto';
import { Octokit } from '@octokit/rest';

import { validateTimelineSpec, type FfmpegTimelineSpec } from '../lib/mediaFfmpegRender.js';
import { canonicalMediaJson, type MediaRoutingRequestV1 } from '../lib/mediaRouter.js';
import { getGitHubInstallationToken } from '../providers/githubAppAuth.js';
import type { Capability } from './workbenchRegistry.js';

export const VIDEO_GRAPHIC_RENDER_CAPABILITY_ID = 'video-graphic-render-v1';
export const VIDEO_GRAPHIC_RENDER_CONTRACT = 'fcr/video-graphic-render@v1' as const;
export const VIDEO_GRAPHIC_RENDER_WORKFLOW = 'video-remote-render.yml' as const;
export const VIDEO_GRAPHIC_RENDER_REPOSITORY = 'jussray/founder-control-room' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const GRAPHIC_ONLY_INTENTS = new Set(['compose', 'overlay']);

export const VIDEO_GRAPHIC_RENDER_CAPABILITY: Capability = {
  id: VIDEO_GRAPHIC_RENDER_CAPABILITY_ID,
  kind: 'Automation',
  category: 'automations',
  score: 98,
  runtime: 'dynamic',
  summary: 'Render bounded assetless graphic-animation timelines on the governed FCR FFmpeg execution host.',
  purpose: 'Give FCR a first-party render path for text, color, framing, fades, and synthesized-bed graphic videos without pretending the lane can transport storyboard/source-image assets or publish media.',
  inputs: [
    ['request', 'MediaRoutingRequestV1', 'Exact post/compose or post/overlay media request with no reference assets'],
    ['timeline', 'FfmpegTimelineSpec', 'Graphic-only timeline with no imagePath or custom font paths'],
  ],
  environment: [
    'Exact deployed FCR main SHA',
    'Repository-scoped GitHub App authority or local/dev GITHUB_TOKEN fallback',
    'FCR Remote Video Render workflow with FFmpeg + Playwright proof',
  ],
  proof: [
    'Dispatch is bound to exact main SHA and canonical input SHA-256',
    'Remote workflow renders through the FCR-owned CLI and verifies playback with Playwright',
    'Successful workflow retains render, playback, admission, and remote-execution receipts as one artifact',
    'publishAuthority remains false',
  ],
  risk: 'Graphic-only render execution. It does not accept source images, storyboard frame-zero assets, local font paths, generated-scene motion, publication authority, or a claim that an artifact was published.',
  implementation: 'Runtime-backed: POST /capabilities/video-graphic-render-v1/runs with { request, timeline }, then poll GET /capabilities/video-graphic-render-v1/runs/:invocationId.',
};

export type VideoGraphicRenderErrorCode =
  | 'invalid_remote_graphic_request'
  | 'runtime_identity_unavailable'
  | 'runtime_not_exact_main'
  | 'github_render_authority_unavailable'
  | 'remote_render_dispatch_failed'
  | 'remote_render_run_not_found'
  | 'remote_render_status_failed';

export class VideoGraphicRenderError extends Error {
  constructor(
    readonly code: VideoGraphicRenderErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VideoGraphicRenderError';
  }
}

export interface VideoGraphicRenderPlanV1 {
  contract: typeof VIDEO_GRAPHIC_RENDER_CONTRACT;
  requestId: string;
  projectId: string;
  workspaceId: string;
  executionKind: 'DETERMINISTIC_POST';
  tool: 'ffmpeg';
  motionClass: 'GRAPHIC_ANIMATION';
  canonicalTimelineJson: string;
  inputSha256: string;
  publishAuthority: false;
}

export interface VideoGraphicRenderWorkflowRun {
  id: number;
  status: string | null;
  conclusion: string | null;
  htmlUrl: string;
  headSha: string;
  displayTitle: string;
}

export interface VideoGraphicRenderArtifact {
  id: number;
  name: string;
  expired: boolean;
}

export interface VideoGraphicRenderProvider {
  resolveMainSha(): Promise<string>;
  dispatch(input: {
    invocationId: string;
    expectedHeadSha: string;
    inputSha256: string;
    timelineJson: string;
  }): Promise<void>;
  findRun(invocationId: string): Promise<VideoGraphicRenderWorkflowRun | null>;
  listArtifacts(runId: number): Promise<VideoGraphicRenderArtifact[]>;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', `${label} must be an object.`, 400);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', `${field} must be a non-empty string.`, 400);
  }
  return value.trim();
}

function timelineDurationSec(timeline: FfmpegTimelineSpec): number {
  return timeline.segments.reduce((sum, segment) => sum + segment.durationSec, 0);
}

function assertOutputBinding(request: MediaRoutingRequestV1, timeline: FfmpegTimelineSpec): void {
  const { output } = request;
  if (output.width !== undefined && output.width !== timeline.width) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'request.output.width must match timeline.width.', 400);
  }
  if (output.height !== undefined && output.height !== timeline.height) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'request.output.height must match timeline.height.', 400);
  }
  if (output.fps !== undefined && output.fps !== timeline.fps) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'request.output.fps must match timeline.fps.', 400);
  }
  if (output.durationSeconds !== undefined && Math.abs(output.durationSeconds - timelineDurationSec(timeline)) > 1e-9) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'request.output.durationSeconds must match the declared timeline duration.', 400);
  }
  if (output.audioRequired === true && !timeline.audio) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'request.output.audioRequired requires timeline.audio.', 400);
  }

  const aspect = output.aspectRatio;
  if (!aspect || aspect === 'custom') return;
  const [rw, rh] = aspect.split(':').map(Number);
  if (!rw || !rh || timeline.width * rh !== timeline.height * rw) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', `request.output.aspectRatio ${aspect} must match timeline dimensions.`, 400);
  }
}

export function prepareVideoGraphicRender(input: unknown): VideoGraphicRenderPlanV1 {
  const body = asRecord(input, 'body');
  const requestRecord = asRecord(body.request, 'request');
  const timelineRecord = asRecord(body.timeline, 'timeline');

  const request = requestRecord as unknown as MediaRoutingRequestV1;
  const timeline = timelineRecord as unknown as FfmpegTimelineSpec;

  const requestId = nonEmptyString(request.requestId, 'request.requestId');
  const projectId = nonEmptyString(request.projectId, 'request.projectId');
  const workspaceId = nonEmptyString(request.workspaceId, 'request.workspaceId');
  nonEmptyString(request.correlationId, 'request.correlationId');
  nonEmptyString(request.requestedBy, 'request.requestedBy');

  if (request.type !== 'post' || !GRAPHIC_ONLY_INTENTS.has(request.intent)) {
    throw new VideoGraphicRenderError(
      'invalid_remote_graphic_request',
      'Remote FFmpeg execution is limited to assetless post/compose or post/overlay requests.',
      400,
    );
  }
  if (!Array.isArray(request.referenceAssetIds) || request.referenceAssetIds.length !== 0) {
    throw new VideoGraphicRenderError(
      'invalid_remote_graphic_request',
      'Remote graphic execution does not transport source/reference assets; use the storyboard/provider lane for image-backed video.',
      400,
    );
  }
  if (request.authority?.action !== 'media.generate') {
    throw new VideoGraphicRenderError(
      'invalid_remote_graphic_request',
      'Remote graphic execution accepts media.generate authority only; publication is a separate gate.',
      400,
    );
  }

  if ('fontFile' in timelineRecord || 'fontFileBold' in timelineRecord) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'Remote graphic execution does not accept local font paths.', 400);
  }
  if (!Array.isArray(timelineRecord.segments)) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'timeline.segments must be an array.', 400);
  }
  if (timelineRecord.segments.some((segment) => {
    const record = segment && typeof segment === 'object' && !Array.isArray(segment)
      ? segment as Record<string, unknown>
      : null;
    return Boolean(record && 'imagePath' in record);
  })) {
    throw new VideoGraphicRenderError(
      'invalid_remote_graphic_request',
      'Remote graphic execution does not accept imagePath; storyboard frame-zero assets must stay on the image-backed video lane.',
      400,
    );
  }

  let invalid: string | null;
  try {
    invalid = validateTimelineSpec(timeline);
  } catch {
    invalid = 'timeline does not match FfmpegTimelineSpec';
  }
  if (invalid) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', invalid, 400);
  }
  assertOutputBinding(request, timeline);

  const canonicalTimelineJson = canonicalMediaJson(timeline);
  const inputSha256 = createHash('sha256').update(canonicalTimelineJson).digest('hex');

  return {
    contract: VIDEO_GRAPHIC_RENDER_CONTRACT,
    requestId,
    projectId,
    workspaceId,
    executionKind: 'DETERMINISTIC_POST',
    tool: 'ffmpeg',
    motionClass: 'GRAPHIC_ANIMATION',
    canonicalTimelineJson,
    inputSha256,
    publishAuthority: false,
  };
}

function runtimeSha(): string {
  const value = process.env.GIT_SHA?.trim().toLowerCase() ?? '';
  if (!FULL_SHA.test(value)) {
    throw new VideoGraphicRenderError(
      'runtime_identity_unavailable',
      'Remote render dispatch requires the exact deployed FCR Git SHA.',
      503,
    );
  }
  return value;
}

async function githubClient(): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID?.trim() ?? '';
  const privateKey = process.env.GITHUB_PRIVATE_KEY?.trim() ?? '';
  const fallback = process.env.GITHUB_TOKEN?.trim() ?? '';

  if (Boolean(appId) !== Boolean(privateKey)) {
    throw new VideoGraphicRenderError(
      'github_render_authority_unavailable',
      'GitHub App render authority is incompletely configured.',
      503,
    );
  }

  if (appId && privateKey) {
    const token = await getGitHubInstallationToken(appId, privateKey, VIDEO_GRAPHIC_RENDER_REPOSITORY);
    return new Octokit({ auth: token, userAgent: 'founder-control-room-video-render' });
  }
  if (fallback) return new Octokit({ auth: fallback, userAgent: 'founder-control-room-video-render' });

  throw new VideoGraphicRenderError(
    'github_render_authority_unavailable',
    'GitHub render authority is not configured.',
    503,
  );
}

export function createGitHubVideoGraphicRenderProvider(): VideoGraphicRenderProvider {
  return {
    async resolveMainSha() {
      const client = await githubClient();
      const branch = await client.repos.getBranch({ owner: 'jussray', repo: 'founder-control-room', branch: 'main' });
      return branch.data.commit.sha.toLowerCase();
    },
    async dispatch(input) {
      const client = await githubClient();
      await client.actions.createWorkflowDispatch({
        owner: 'jussray',
        repo: 'founder-control-room',
        workflow_id: VIDEO_GRAPHIC_RENDER_WORKFLOW,
        ref: 'main',
        inputs: {
          request_id: input.invocationId,
          expected_head_sha: input.expectedHeadSha,
          input_sha256: input.inputSha256,
          timeline_json: input.timelineJson,
        },
      });
    },
    async findRun(invocationId) {
      const client = await githubClient();
      const runs = await client.actions.listWorkflowRuns({
        owner: 'jussray',
        repo: 'founder-control-room',
        workflow_id: VIDEO_GRAPHIC_RENDER_WORKFLOW,
        branch: 'main',
        event: 'workflow_dispatch',
        per_page: 50,
      });
      const expectedTitle = `FCR video render ${invocationId}`;
      const run = runs.data.workflow_runs.find((candidate) => candidate.display_title === expectedTitle);
      return run
        ? {
            id: run.id,
            status: run.status ?? null,
            conclusion: run.conclusion ?? null,
            htmlUrl: run.html_url,
            headSha: run.head_sha.toLowerCase(),
            displayTitle: run.display_title,
          }
        : null;
    },
    async listArtifacts(runId) {
      const client = await githubClient();
      const response = await client.actions.listWorkflowRunArtifacts({
        owner: 'jussray',
        repo: 'founder-control-room',
        run_id: runId,
        per_page: 100,
      });
      return response.data.artifacts.map((artifact) => ({
        id: artifact.id,
        name: artifact.name,
        expired: artifact.expired,
      }));
    },
  };
}

export async function dispatchVideoGraphicRender(
  input: unknown,
  provider: VideoGraphicRenderProvider = createGitHubVideoGraphicRenderProvider(),
) {
  const plan = prepareVideoGraphicRender(input);
  const expectedHeadSha = runtimeSha();

  let currentMainSha: string;
  try {
    currentMainSha = (await provider.resolveMainSha()).toLowerCase();
  } catch (error) {
    if (error instanceof VideoGraphicRenderError) throw error;
    throw new VideoGraphicRenderError('remote_render_dispatch_failed', 'Could not verify current FCR main before render dispatch.', 502);
  }
  if (currentMainSha !== expectedHeadSha) {
    throw new VideoGraphicRenderError(
      'runtime_not_exact_main',
      'Remote render dispatch requires the deployed FCR runtime to equal current main.',
      409,
    );
  }

  const invocationId = `video-graphic-${plan.inputSha256.slice(0, 12)}-${randomUUID()}`;
  try {
    await provider.dispatch({
      invocationId,
      expectedHeadSha,
      inputSha256: plan.inputSha256,
      timelineJson: plan.canonicalTimelineJson,
    });
  } catch (error) {
    if (error instanceof VideoGraphicRenderError) throw error;
    throw new VideoGraphicRenderError('remote_render_dispatch_failed', 'GitHub rejected or could not accept the remote render dispatch.', 502);
  }

  return {
    contract: VIDEO_GRAPHIC_RENDER_CONTRACT,
    invocationId,
    requestId: plan.requestId,
    projectId: plan.projectId,
    workspaceId: plan.workspaceId,
    state: 'dispatched' as const,
    executionKind: plan.executionKind,
    tool: plan.tool,
    motionClass: plan.motionClass,
    expectedHeadSha,
    inputSha256: plan.inputSha256,
    renderAuthority: true as const,
    publishAuthority: false as const,
    verification: 'PENDING_REMOTE_WORKFLOW' as const,
  };
}

export async function readVideoGraphicRenderStatus(
  invocationId: string,
  provider: VideoGraphicRenderProvider = createGitHubVideoGraphicRenderProvider(),
) {
  if (!/^video-graphic-[a-f0-9]{12}-[0-9a-f-]{36}$/i.test(invocationId)) {
    throw new VideoGraphicRenderError('invalid_remote_graphic_request', 'invocationId is malformed.', 400);
  }

  let run: VideoGraphicRenderWorkflowRun | null;
  try {
    run = await provider.findRun(invocationId);
  } catch (error) {
    if (error instanceof VideoGraphicRenderError) throw error;
    throw new VideoGraphicRenderError('remote_render_status_failed', 'Could not read the remote render workflow status.', 502);
  }
  if (!run) {
    throw new VideoGraphicRenderError('remote_render_run_not_found', 'Remote render run has not been observed yet.', 404);
  }

  let artifacts: VideoGraphicRenderArtifact[] = [];
  if (run.status === 'completed' && run.conclusion === 'success') {
    try {
      artifacts = await provider.listArtifacts(run.id);
    } catch {
      throw new VideoGraphicRenderError('remote_render_status_failed', 'Render completed but its evidence artifact could not be read.', 502);
    }
  }
  const evidenceArtifact = artifacts.find((artifact) => artifact.name.startsWith('fcr-video-render-')) ?? null;

  return {
    contract: VIDEO_GRAPHIC_RENDER_CONTRACT,
    invocationId,
    state: run.status,
    conclusion: run.conclusion,
    providerRunId: run.id,
    providerRunUrl: run.htmlUrl,
    headSha: run.headSha,
    renderAuthority: true as const,
    publishAuthority: false as const,
    verification: run.status === 'completed' && run.conclusion === 'success' && evidenceArtifact
      ? 'WORKFLOW_AND_PLAYBACK_VERIFIED' as const
      : run.status === 'completed'
        ? 'WORKFLOW_NOT_VERIFIED' as const
        : 'PENDING_REMOTE_WORKFLOW' as const,
    evidenceArtifact,
  };
}
