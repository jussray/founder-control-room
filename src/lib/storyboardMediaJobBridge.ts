/** Private operator seam. Inputs/approval bindings must come from reviewed trusted
 * records, never browser assertions. Hash agreement is identity, not human approval
 * or proof of generated fidelity. This module queues only; it never spends or renders. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { mediaJobInputFingerprint, type DurableMediaJobs, type MediaJobApproval, type MediaJobReference, type MediaJobRequest, type MediaJobRecord } from './mediaJobExecution.js';

export interface PrivateStoryboard {
  projectId: string;
  storyboardId: string;
  fps: 24 | 25 | 30;
  audio: MediaJobReference;
  shots: Array<{
    shotId: string;
    durationSeconds: number;
    promptText: string;
    exactDialogue: string;
    /** Canon identity/revision digest, not a newly generated design. */
    canonicalReferenceSha256: string;
    openingFrame: MediaJobReference;
  }>;
}
export interface StoryboardSourceBinding {
  projectId: string;
  sourceRecordId: string;
  storyboardFingerprint: string;
}
function fail(code: string): never { throw new Error(`STORYBOARD_JOB_${code}`); }
function identifier(value: string): void { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value)) fail('INVALID_ID'); }
function sha(value: string): void { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID_HASH'); }
function reference(value: MediaJobReference): void {
  if (!value) fail('REFERENCE_REQUIRED');
  identifier(value.id); sha(value.sha256);
  if (typeof value.path !== 'string' || !isAbsolute(value.path)) fail('ABSOLUTE_REFERENCE_REQUIRED');
}
/** Uses the existing canonical job fingerprint implementation, avoiding another hash convention. */
export function storyboardJobFingerprint(storyboard: PrivateStoryboard): string {
  return mediaJobInputFingerprint({ projectId: storyboard.projectId, requestId: storyboard.storyboardId, adapterId: 'storyboard-binding@v1', request: { storyboard }, references: [] });
}
function compile(storyboard: PrivateStoryboard, binding: StoryboardSourceBinding) {
  identifier(storyboard.projectId); identifier(storyboard.storyboardId);
  if (![24,25,30].includes(storyboard.fps) || !Array.isArray(storyboard.shots) || !storyboard.shots.length || storyboard.shots.length > 120) fail('INVALID_TIMELINE');
  reference(storyboard.audio);
  const seen = new Set<string>();
  let totalFrames = 0;
  for (const shot of storyboard.shots) {
    identifier(shot.shotId);
    if (seen.has(shot.shotId)) fail('DUPLICATE_SHOT');
    seen.add(shot.shotId); reference(shot.openingFrame); sha(shot.canonicalReferenceSha256);
    if (!Number.isInteger(shot.durationSeconds) || shot.durationSeconds < 2 || shot.durationSeconds > 10) fail('UNSUPPORTED_SHOT_DURATION');
    if (typeof shot.promptText !== 'string' || !shot.promptText.trim() || shot.promptText.length > 1000 || typeof shot.exactDialogue !== 'string') fail('INVALID_SCRIPT');
    totalFrames += shot.durationSeconds * storyboard.fps;
  }
  if (totalFrames < 60 * storyboard.fps) fail('MINIMUM_60_SECONDS_REQUIRED');
  const fingerprint = storyboardJobFingerprint(storyboard);
  if (!binding || binding.projectId !== storyboard.projectId || typeof binding.sourceRecordId !== 'string' || !binding.sourceRecordId.trim() || binding.storyboardFingerprint !== fingerprint) fail('SOURCE_BINDING_MISMATCH');
  let startFrame = 0;
  const shots = storyboard.shots.map((shot, index) => {
    const durationFrames = shot.durationSeconds * storyboard.fps;
    // Full storyboard digest in requestId binds dialogue, audio, canon and ordering
    // without falsely supplying audio/canon as supported Runway transport fields.
    const request: MediaJobRequest = {
      projectId: storyboard.projectId,
      requestId: `s${String(index + 1).padStart(3, '0')}_${fingerprint}`,
      adapterId: 'runway-image-to-video@v1',
      request: { model: 'gen4.5', ratio: '720:1280', duration: shot.durationSeconds, promptText: shot.promptText },
      references: [{ ...shot.openingFrame }],
    };
    const entry = { shotId: shot.shotId, order: index + 1, startFrame, durationFrames, exactDialogue: shot.exactDialogue, canonicalReferenceSha256: shot.canonicalReferenceSha256, request, inputFingerprint: mediaJobInputFingerprint(request) };
    startFrame += durationFrames;
    return entry;
  });
  return {
    contract: 'fcr/private-storyboard-media-jobs@v1' as const,
    projectId: storyboard.projectId, storyboardId: storyboard.storyboardId,
    storyboardFingerprint: fingerprint, sourceRecordId: binding.sourceRecordId,
    fps: storyboard.fps, width: 720, height: 1280, totalFrames,
    totalSeconds: totalFrames / storyboard.fps,
    assemblyAudio: { ...storyboard.audio }, shots,
    audioTransport: 'ASSEMBLY_ONLY_NOT_SENT_TO_PROVIDER' as const,
    outputApproval: 'REVIEW_REQUIRED' as const,
    fidelityVerified: false as const, lipSyncVerified: false as const,
    publishAuthority: false as const,
  };
}
export function compileStoryboardMediaJobs(storyboard: PrivateStoryboard, binding: StoryboardSourceBinding): ReturnType<typeof compile> {
  return compile(storyboard, binding);
}
async function verifyAudioBytes(reference: MediaJobReference): Promise<void> {
  const handle = await open(reference.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 512 * 1024 * 1024) fail('AUDIO_NOT_REGULAR_FILE');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > 512 * 1024 * 1024) fail('AUDIO_TOO_LARGE');
      hash.update(buffer.subarray(0, bytesRead));
    }
    if (hash.digest('hex') !== reference.sha256) fail('AUDIO_BYTES_DRIFT');
  } finally { await handle.close(); }
}
/** All spending approvals remain separately required by DurableMediaJobs. A queue
 * failure can leave earlier QUEUED jobs; no provider call occurs, so reconcile/retry
 * through existing job fingerprints rather than inventing replacement jobs. */
export async function queueStoryboardMediaJobs(input: {
  storyboard: PrivateStoryboard;
  binding: StoryboardSourceBinding;
  approvals: readonly MediaJobApproval[];
  jobs: Pick<DurableMediaJobs, 'queue'>;
  now?: string;
}): Promise<{ plan: ReturnType<typeof compile>; queued: MediaJobRecord[] }> {
  const plan = compileStoryboardMediaJobs(input.storyboard, input.binding);
  const now = Date.parse(input.now ?? new Date().toISOString());
  if (!Number.isFinite(now) || input.approvals.length !== plan.shots.length) fail('JOB_APPROVALS_REQUIRED');
  for (const [index, shot] of plan.shots.entries()) {
    const approval = input.approvals[index];
    if (approval?.approved !== true || approval.projectId !== plan.projectId || approval.adapterId !== shot.request.adapterId || approval.inputFingerprint !== shot.inputFingerprint || !approval.sourceRecordId?.trim() || !Number.isFinite(approval.maxCostUsd) || approval.maxCostUsd <= 0 || !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now) fail('JOB_APPROVAL_MISMATCH');
  }
  await verifyAudioBytes(plan.assemblyAudio);
  const queued = [];
  for (const [index, shot] of plan.shots.entries()) queued.push(await input.jobs.queue(shot.request, input.approvals[index]));
  return { plan, queued };
}
