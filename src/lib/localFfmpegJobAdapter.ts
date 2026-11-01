import { lstat, mkdir, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { renderFfmpegTimelineV1, type FfmpegTimelineSpec } from './mediaFfmpegRender.js';
import type { MediaJobAdapter, MediaJobAdapterInput, MediaJobAdapterResult } from './mediaJobExecution.js';

export class LocalFfmpegJobAdapter implements MediaJobAdapter {
  readonly id = 'ffmpeg-graphic@v1';
  constructor(private readonly outputRoot: string) {
    if (!isAbsolute(outputRoot)) throw new Error('MEDIA_JOB_ABSOLUTE_OUTPUT_REQUIRED');
  }
  async submit(input: MediaJobAdapterInput): Promise<MediaJobAdapterResult> {
    if (!/^job_[a-f0-9]{64}$/.test(input.jobId)) throw new Error('MEDIA_JOB_INVALID_ID');
    await mkdir(this.outputRoot, { recursive: true, mode: 0o700 });
    if ((await lstat(this.outputRoot)).isSymbolicLink()) throw new Error('MEDIA_JOB_UNSAFE_OUTPUT_ROOT');
    const timeline = structuredClone(input.request.timeline) as FfmpegTimelineSpec;
    if (!timeline || timeline.fontFile || timeline.fontFileBold || !Array.isArray(timeline.segments)) throw new Error('MEDIA_JOB_INVALID_TIMELINE');
    timeline.segments = timeline.segments.map((segment) => {
      const value = segment as typeof segment & { imageReferenceId?: string };
      if (value.imagePath) throw new Error('MEDIA_JOB_UNBOUND_IMAGE_PATH');
      const { imageReferenceId, ...rest } = value;
      if (!imageReferenceId) return rest;
      const reference = input.references.find((r) => r.id === imageReferenceId);
      if (!reference) throw new Error('MEDIA_JOB_REFERENCE_NOT_FOUND');
      return { ...rest, imagePath: reference.path };
    });
    const outputPath = join(await realpath(this.outputRoot), input.jobId + '.mp4');
    try { await lstat(outputPath); throw new Error('MEDIA_JOB_OUTPUT_EXISTS'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const result = await renderFfmpegTimelineV1(timeline, outputPath);
    if (result.kind !== 'RENDERED') return { taskId: input.jobId, state: 'FAILED', safeCode: result.kind };
    return { taskId: input.jobId, state: 'SUCCEEDED', output: { sha256: result.sha256, uri: result.outputPath, metadata: { motionClass: result.motionClass, probe: result.probe, bytes: result.bytes, inputFingerprint: result.inputFingerprint, outputApproval: 'REVIEW_REQUIRED' } } };
  }
  async poll(): Promise<MediaJobAdapterResult> { throw new Error('MEDIA_JOB_LOCAL_SUBMISSION_IS_TERMINAL'); }
}
