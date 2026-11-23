import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DurableMediaJobs, type MediaJobApproval } from '../mediaJobExecution.js';
import { compileStoryboardMediaJobs, queueStoryboardMediaJobs, storyboardJobFingerprint, type PrivateStoryboard } from '../storyboardMediaJobBridge.js';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
function storyboard(): PrivateStoryboard {
  return { projectId: 'bip', storyboardId: 'cloud-01', fps: 30,
    audio: { id: 'dialogue', path: '/private/dialogue.wav', sha256: hash('dialogue') },
    shots: Array.from({ length: 6 }, (_, i) => ({ shotId: `shot-${i + 1}`, durationSeconds: 10, promptText: `Approved scene ${i + 1}`, exactDialogue: i === 2 ? '' : `Line ${i + 1}`, canonicalReferenceSha256: hash('approved-canon'), openingFrame: { id: `frame-${i + 1}`, path: `/private/frame-${i + 1}.png`, sha256: hash('frame') } })) };
}
const binding = (s: PrivateStoryboard) => ({ projectId: s.projectId, sourceRecordId: 'trusted-storyboard-review', storyboardFingerprint: storyboardJobFingerprint(s) });
const approvals = (s: PrivateStoryboard): MediaJobApproval[] => compileStoryboardMediaJobs(s, binding(s)).shots.map(shot => ({ approved: true, sourceRecordId: 'separate-budget-review', projectId: s.projectId, adapterId: shot.request.adapterId, inputFingerprint: shot.inputFingerprint, maxCostUsd: 1, expiresAt: '2026-12-01T00:00:00.000Z' }));
const now = '2026-11-23T00:00:00.000Z';
describe('private storyboard to durable operator jobs', () => {
  it('preserves six ordered 10-second shots, silent dialogue and assembly-only audio without asserting fidelity', () => {
    const s = storyboard(); const plan = compileStoryboardMediaJobs(s, binding(s));
    expect(plan.totalSeconds).toBe(60); expect(plan.totalFrames).toBe(1800);
    expect(plan.shots.map(shot => [shot.shotId, shot.startFrame])).toEqual(s.shots.map((shot, i) => [shot.shotId, i * 300]));
    expect(plan.shots[2].exactDialogue).toBe('');
    expect(plan.assemblyAudio).toEqual(s.audio);
    expect(plan.shots[0].request.request).toEqual({ model: 'gen4.5', ratio: '720:1280', duration: 10, promptText: s.shots[0].promptText });
    expect(plan.shots[0].request.references).toEqual([s.shots[0].openingFrame]);
    expect(plan.audioTransport).toBe('ASSEMBLY_ONLY_NOT_SENT_TO_PROVIDER');
    expect([plan.fidelityVerified, plan.lipSyncVerified, plan.publishAuthority]).toEqual([false, false, false]);
    expect(plan.outputApproval).toBe('REVIEW_REQUIRED');
  });
  it('rejects short timelines, unsupported durations, repeated identities and wrong scope', () => {
    for (const change of [
      (s: PrivateStoryboard) => { s.shots.pop(); },
      (s: PrivateStoryboard) => { s.shots[0].durationSeconds = 11; },
      (s: PrivateStoryboard) => { s.shots[1].shotId = s.shots[0].shotId; },
    ]) { const s = storyboard(); change(s); expect(() => compileStoryboardMediaJobs(s, binding(s))).toThrow('STORYBOARD_JOB_'); }
    const s = storyboard(); expect(() => compileStoryboardMediaJobs(s, { ...binding(s), projectId: 'other' })).toThrow('SOURCE_BINDING');
    s.shots.push({ ...s.shots[0], shotId: 'shot-7' }); expect(compileStoryboardMediaJobs(s, binding(s)).totalSeconds).toBe(70);
  });
  it('invalidates source and job bindings on ordering, audio, script, frame or canon drift', () => {
    for (const change of [
      (s: PrivateStoryboard) => { s.shots.reverse(); },
      (s: PrivateStoryboard) => { s.audio.sha256 = hash('different recording'); },
      (s: PrivateStoryboard) => { s.shots[0].exactDialogue = 'improvised'; },
      (s: PrivateStoryboard) => { s.shots[0].openingFrame.sha256 = hash('different frame'); },
      (s: PrivateStoryboard) => { s.shots[0].canonicalReferenceSha256 = hash('different canon'); },
    ]) { const s = storyboard(); const original = binding(s); const first = compileStoryboardMediaJobs(s, original).shots[0].inputFingerprint; change(s); expect(() => compileStoryboardMediaJobs(s, original)).toThrow('SOURCE_BINDING'); expect(compileStoryboardMediaJobs(s, binding(s)).shots[0].inputFingerprint).not.toBe(first); }
  });
  it('queues into the actual durable runtime in order without invoking the provider', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fcr-storyboard-')); const s = storyboard();
    const frame = join(root, 'frame.png'); const audio = join(root, 'audio.wav');
    await writeFile(frame, 'frame'); await writeFile(audio, 'dialogue');
    s.audio.path = audio; for (const shot of s.shots) shot.openingFrame.path = frame;
    let submitted = 0;
    const jobs = new DurableMediaJobs(join(root, 'jobs'), 'bip', [{ id: 'runway-image-to-video@v1', async submit() { submitted++; throw new Error('not permitted'); }, async poll() { throw new Error('not permitted'); } }], () => now);
    const result = await queueStoryboardMediaJobs({ storyboard: s, binding: binding(s), approvals: approvals(s), jobs, now });
    expect(submitted).toBe(0); expect(result.queued).toHaveLength(6);
    expect(result.queued.map(job => job.inputFingerprint)).toEqual(result.plan.shots.map(shot => shot.inputFingerprint));
    expect(result.queued.every(job => job.state === 'QUEUED' && job.outputApproval === 'REVIEW_REQUIRED' && !job.publishAuthority)).toBe(true);
    await writeFile(audio, 'changed');
    await expect(queueStoryboardMediaJobs({ storyboard: s, binding: binding(s), approvals: approvals(s), jobs, now })).rejects.toThrow('AUDIO_BYTES_DRIFT');
  });
  it('preflights every separate spending approval before any queue or filesystem access', async () => {
    const s = storyboard(); let queued = 0;
    const jobs = { async queue() { queued++; throw new Error('must not queue'); } };
    const approved = approvals(s); approved[5] = { ...approved[5], inputFingerprint: hash('wrong') };
    await expect(queueStoryboardMediaJobs({ storyboard: s, binding: binding(s), approvals: approved, jobs, now })).rejects.toThrow('JOB_APPROVAL_MISMATCH');
    expect(queued).toBe(0);
  });
});


describe('private storyboard CLI', () => {
  it('compiles and queues real private handoffs across processes without credentials or public prompts', async () => {
    const run = promisify(execFile); const root = await mkdtemp(join(tmpdir(), 'fcr-storyboard-cli-'));
    const s = storyboard(); const frame = join(root, 'frame.png'); s.audio.path = join(root, 'audio.wav');
    await writeFile(frame, 'frame'); await writeFile(s.audio.path, 'dialogue');
    for (const shot of s.shots) shot.openingFrame.path = frame;
    const source = join(root, 'storyboard.json'); const sourceBinding = join(root, 'binding.json'); const budgets = join(root, 'approvals.json');
    await writeFile(source, JSON.stringify(s)); await writeFile(sourceBinding, JSON.stringify(binding(s)));
    await writeFile(budgets, JSON.stringify(approvals(s).map(a => ({ ...a, expiresAt: new Date(Date.now() + 60000).toISOString() }))));
    const common = ['--import', 'tsx', 'scripts/storyboard-media-jobs.mts', '--storyboard', source];
    const fingerprint = JSON.parse((await run(process.execPath, [...common, '--action', 'fingerprint'])).stdout);
    expect(fingerprint.storyboardFingerprint).toBe(storyboardJobFingerprint(s));
    const planPath = join(root, 'plan.json');
    const compiled = await run(process.execPath, [...common, '--action', 'compile', '--binding', sourceBinding, '--output', planPath]);
    expect(JSON.parse(compiled.stdout).state).toBe('COMPILED');
    expect(compiled.stdout).not.toContain('Approved scene');
    expect((await stat(planPath)).mode & 0o777).toBe(0o600);
    await expect(run(process.execPath, [...common, '--action', 'compile', '--binding', sourceBinding, '--output', planPath])).rejects.toThrow();
    const queuedPath = join(root, 'queued.json');
    const queued = await run(process.execPath, [...common, '--action', 'queue', '--binding', sourceBinding, '--approvals', budgets, '--root', join(root, 'jobs'), '--output', queuedPath]);
    expect(JSON.parse(queued.stdout).state).toBe('QUEUED');
    const saved = JSON.parse(await readFile(queuedPath, 'utf8'));
    expect(saved.queued).toHaveLength(6);
    expect(saved.queued.every((job: { state: string }) => job.state === 'QUEUED')).toBe(true);
    expect(saved.plan.assemblyAudio).toEqual(s.audio);
  }, 30000);
});
