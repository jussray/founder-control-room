import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DurableMediaJobs, mediaJobInputFingerprint, type MediaJobRequest, type MediaJobApproval, type MediaJobAdapter } from '../mediaJobExecution.js';
import { LocalFfmpegJobAdapter } from '../localFfmpegJobAdapter.js';

const now = '2026-11-01T21:00:00.000Z';
const request = (): MediaJobRequest => ({ projectId: 'project-1', requestId: 'request-1', adapterId: 'ffmpeg-graphic@v1', request: { timeline: { width: 320, height: 180, fps: 24, segments: [{ durationSec: 1, background: '#101018', lines: [] }] } }, references: [] });
const approval = (input: MediaJobRequest): MediaJobApproval => ({ approved: true, sourceRecordId: 'review-1', projectId: input.projectId, adapterId: input.adapterId, inputFingerprint: mediaJobInputFingerprint(input), maxCostUsd: 0, expiresAt: '2026-11-02T21:00:00.000Z' });
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

describe('durable operator media jobs', () => {
  it('queues, actually renders and recovers the candidate after service restart without promoting approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    const adapters = [new LocalFfmpegJobAdapter(join(root, 'outputs'))];
    const first = new DurableMediaJobs(root, 'project-1', adapters, () => now);
    const input = request();
    const queued = await first.queue(input, approval(input));
    expect(queued.state).toBe('QUEUED');
    await expect(first.execute(queued.jobId, false)).rejects.toThrow('EXPLICIT_EXECUTE');
    const rendered = await first.execute(queued.jobId, true);
    expect(rendered.state).toBe('SUCCEEDED');
    expect(rendered.result?.output?.sha256).toMatch(/^[a-f0-9]{64}$/);
    const bytes = await readFile(rendered.result!.output!.uri!);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(rendered.result?.output?.sha256);
    expect(rendered.outputApproval).toBe('REVIEW_REQUIRED');
    expect(rendered.publishAuthority).toBe(false);
    const restarted = new DurableMediaJobs(root, 'project-1', adapters, () => now);
    expect(await restarted.status(queued.jobId)).toEqual(rendered);
    expect(await restarted.execute(queued.jobId, true)).toEqual(rendered);
  }, 60_000);

  it('rejects wrong scope, expired or drifted approval before submission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    const jobs = new DurableMediaJobs(root, 'project-1', [new LocalFfmpegJobAdapter(join(root, 'outputs'))], () => now);
    const input = request();
    await expect(jobs.queue(input, { ...approval(input), projectId: 'other' })).rejects.toThrow('APPROVAL_MISMATCH');
    await expect(jobs.queue(input, { ...approval(input), expiresAt: now })).rejects.toThrow('APPROVAL_MISMATCH');
    await expect(jobs.queue({ ...input, request: { changed: true } }, approval(input))).rejects.toThrow('APPROVAL_MISMATCH');
    await expect(jobs.queue({ ...input, adapterId: 'unknown' }, approval({ ...input, adapterId: 'unknown' }))).rejects.toThrow('ADAPTER_NOT_CONFIGURED');
  });

  it('snapshots approved reference bytes and rejects altered stored bytes before provider execution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    const source = join(root, 'reference.ppm');
    const ppm = 'P3\n1 1\n255\n255 0 0\n';
    await writeFile(source, ppm);
    const input = { ...request(), references: [{ id: 'frame', path: source, sha256: hash(ppm) }] };
    const jobs = new DurableMediaJobs(root, 'project-1', [new LocalFfmpegJobAdapter(join(root, 'outputs'))], () => now);
    const queued = await jobs.queue(input, approval(input));
    await writeFile(join(root, 'project-1', queued.jobId, 'frame.reference'), 'altered');
    await expect(jobs.execute(queued.jobId, true)).rejects.toThrow('REFERENCE_DRIFT');
  });

  it('keeps an ambiguous submit blocked instead of paying or rendering twice', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    let submissions = 0;
    const adapter: MediaJobAdapter = { id: 'remote-test', async submit() { submissions++; throw new Error('simulated network disconnect'); }, async poll() { throw new Error('not reached'); } };
    const jobs = new DurableMediaJobs(root, 'project-1', [adapter], () => now);
    const input = { ...request(), adapterId: adapter.id };
    const queued = await jobs.queue(input, approval(input));
    await expect(jobs.execute(queued.jobId, true)).rejects.toThrow();
    expect((await jobs.status(queued.jobId)).state).toBe('SUBMITTING');
    await expect(jobs.execute(queued.jobId, true)).rejects.toThrow('RECONCILIATION_REQUIRED');
    expect(submissions).toBe(1);
  });

  it('rejects tampering with the snapshotted reference descriptor even if its replacement hash matches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    const source = join(root, 'reference.ppm'); const original = 'P3\n1 1\n255\n255 0 0\n';
    await writeFile(source, original);
    const input = { ...request(), references: [{ id: 'frame', path: source, sha256: hash(original) }] };
    const jobs = new DurableMediaJobs(root, 'project-1', [new LocalFfmpegJobAdapter(join(root, 'outputs'))], () => now);
    const queued = await jobs.queue(input, approval(input));
    const path = join(root, 'project-1', queued.jobId, 'input.json');
    const saved = JSON.parse(await readFile(path, 'utf8'));
    const replacement = join(root, 'replacement.ppm'); await writeFile(replacement, 'replacement');
    saved.references[0] = { id: 'frame', path: replacement, sha256: hash('replacement') };
    await writeFile(path, JSON.stringify(saved));
    await expect(jobs.execute(queued.jobId, true)).rejects.toThrow('REFERENCE_DRIFT');
  });

  it('rejects a project alias into another project even when the target stays under the jobs root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    await mkdir(join(root, 'other-project')); await symlink(join(root, 'other-project'), join(root, 'project-1'));
    const jobs = new DurableMediaJobs(root, 'project-1', [new LocalFfmpegJobAdapter(join(root, 'outputs'))], () => now);
    await expect(jobs.queue(request(), approval(request()))).rejects.toThrow('UNSAFE_PROJECT_PATH');
  });

  it('permits correcting a queue-only reference preflight failure without resubmitting a provider task', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-')); const source = join(root, 'reference.ppm');
    const original = 'P3\n1 1\n255\n255 0 0\n'; await writeFile(source, 'wrong');
    const input = { ...request(), references: [{ id: 'frame', path: source, sha256: hash(original) }] };
    const jobs = new DurableMediaJobs(root, 'project-1', [new LocalFfmpegJobAdapter(join(root, 'outputs'))], () => now);
    await expect(jobs.queue(input, approval(input))).rejects.toThrow('REFERENCE_DRIFT');
    await writeFile(source, original);
    expect((await jobs.queue(input, approval(input))).state).toBe('QUEUED');
  });

  it('persists a pending task and polls through a fresh process-owned service', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    const adapter: MediaJobAdapter = { id: 'remote-test', async submit() { return { taskId: 'task-1', state: 'PENDING' }; }, async poll(taskId) { return { taskId, state: 'SUCCEEDED', output: { uri: 'https://example.invalid/candidate.mp4' } }; } };
    const input = { ...request(), adapterId: adapter.id };
    const jobs = new DurableMediaJobs(root, 'project-1', [adapter], () => now);
    const queued = await jobs.queue(input, approval(input));
    expect((await jobs.execute(queued.jobId, true)).state).toBe('SUBMITTED');
    const restarted = new DurableMediaJobs(root, 'project-1', [adapter], () => now);
    const result = await restarted.execute(queued.jobId, true, true);
    expect(result.state).toBe('SUCCEEDED');
    expect(result.outputApproval).toBe('REVIEW_REQUIRED');
  });

  it('binds materialized bytes to the completed job without granting human approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-job-'));
    const adapter: MediaJobAdapter = { id: 'remote-test', async submit() { return { taskId: 'task-1', state: 'SUCCEEDED', output: { uri: 'https://example.invalid/candidate.mp4' } }; }, async poll() { throw new Error('not reached'); } };
    const input = { ...request(), adapterId: adapter.id }; const jobs = new DurableMediaJobs(root, 'project-1', [adapter], () => now);
    const queued = await jobs.queue(input, approval(input)); await jobs.execute(queued.jobId, true);
    await expect(jobs.materialize(queued.jobId, join(root, 'outside.mp4'), true, async () => { throw new Error('must not call'); })).rejects.toThrow('SCOPED_OUTPUT');
    const output = join(root, 'project-1', queued.jobId, 'candidate.mp4');
    const record = await jobs.materialize(queued.jobId, output, true, async (candidate, path) => {
      await writeFile(path, 'candidate bytes');
      return { ...candidate, output: { uri: path, sha256: hash('candidate bytes') } };
    });
    expect(record.inputFingerprint).toBe(queued.inputFingerprint);
    expect(record.taskId).toBe('task-1');
    expect(record.result?.output?.sha256).toBe(hash('candidate bytes'));
    expect(record.outputApproval).toBe('REVIEW_REQUIRED');
    expect(record.publishAuthority).toBe(false);
  });
});
