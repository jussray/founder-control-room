import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { mediaJobInputFingerprint, type MediaJobRequest } from '../mediaJobExecution.js';
const run = promisify(execFile);

describe('operator media job command', () => {
  it('queues and renders through separate CLI processes, then reads the persisted receipt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-media-cli-'));
    const request: MediaJobRequest = { projectId: 'cli-project', requestId: 'cli-request', adapterId: 'ffmpeg-graphic@v1', references: [], request: { timeline: { width: 320, height: 180, fps: 24, segments: [{ durationSec: 1, background: '#101018', lines: [] }] } } };
    const input = join(root, 'input.json'); const approval = join(root, 'approval.json');
    await writeFile(input, JSON.stringify(request));
    await writeFile(approval, JSON.stringify({ approved: true, sourceRecordId: 'synthetic-cli-review', projectId: request.projectId, adapterId: request.adapterId, inputFingerprint: mediaJobInputFingerprint(request), maxCostUsd: 0, expiresAt: new Date(Date.now() + 60000).toISOString() }));
    const common = ['--import', 'tsx', 'scripts/media-job.mts', '--root', root, '--project', request.projectId];
    const queued = JSON.parse((await run(process.execPath, [...common, '--action', 'queue', '--input', input, '--approval', approval])).stdout);
    expect(queued.state).toBe('QUEUED');
    await expect(run(process.execPath, [...common, '--action', 'submit', '--job', queued.jobId])).rejects.toThrow();
    const completed = JSON.parse((await run(process.execPath, [...common, '--action', 'submit', '--job', queued.jobId, '--execute'])).stdout);
    expect(completed.state).toBe('SUCCEEDED');
    expect(completed.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(completed.outputApproval).toBe('REVIEW_REQUIRED');
    const status = JSON.parse((await run(process.execPath, [...common, '--action', 'status', '--job', queued.jobId])).stdout);
    expect(status).toEqual(completed);
    const receipt = JSON.parse(await readFile(join(root, request.projectId, queued.jobId, '000002.json'), 'utf8'));
    expect(receipt.result.output.metadata.motionClass).toBe('GRAPHIC_ANIMATION');
    expect(receipt.publishAuthority).toBe(false);
  }, 60_000);
});
