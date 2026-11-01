import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

export interface MediaJobReference { id: string; path: string; sha256: string }
export interface MediaJobAdapterInput {
  jobId: string;
  projectId: string;
  inputFingerprint: string;
  request: Record<string, unknown>;
  references: MediaJobReference[];
  maxCostUsd: number;
}
export interface MediaJobAdapterResult {
  taskId: string;
  state: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  output?: { sha256?: string; uri?: string; metadata?: Record<string, unknown> };
  safeCode?: string;
}
export interface MediaJobAdapter {
  readonly id: string;
  submit(input: MediaJobAdapterInput): Promise<MediaJobAdapterResult>;
  poll(taskId: string): Promise<MediaJobAdapterResult>;
}
export interface MediaJobRequest {
  projectId: string;
  requestId: string;
  adapterId: string;
  request: Record<string, unknown>;
  references: MediaJobReference[];
}
export interface MediaJobApproval {
  approved: true;
  sourceRecordId: string;
  projectId: string;
  adapterId: string;
  inputFingerprint: string;
  maxCostUsd: number;
  expiresAt: string;
}
export interface MediaJobRecord {
  version: 'fcr/media-job@v1';
  jobId: string;
  projectId: string;
  adapterId: string;
  inputFingerprint: string;
  state: 'QUEUED' | 'SUBMITTING' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  recordedAt: string;
  approvalRecordId: string;
  taskId?: string;
  result?: MediaJobAdapterResult;
  outputApproval: 'REVIEW_REQUIRED';
  publishAuthority: false;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function mediaJobInputFingerprint(request: MediaJobRequest): string {
  return createHash('sha256').update(stable(request)).digest('hex');
}
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
function id(value: string): string { if (!idPattern.test(value)) throw new Error('MEDIA_JOB_INVALID_ID'); return value; }
function sha(value: string): void { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('MEDIA_JOB_INVALID_HASH'); }
async function fileHash(path: string): Promise<string> { return createHash('sha256').update(await readFile(path)).digest('hex'); }

/** Operator-only local runtime. The trusted operator supplies the separately reviewed approval file.
 * An approval assertion is not independent proof of founder identity or production eligibility. */
export class DurableMediaJobs {
  constructor(private readonly root: string, private readonly projectId: string, private readonly adapters: readonly MediaJobAdapter[], private readonly now = () => new Date().toISOString()) {
    if (!isAbsolute(root)) throw new Error('MEDIA_JOB_ABSOLUTE_ROOT_REQUIRED');
    id(projectId);
    if (new Set(adapters.map((a) => a.id)).size !== adapters.length) throw new Error('MEDIA_JOB_DUPLICATE_ADAPTER');
  }
  private async directory(jobId: string): Promise<string> {
    id(jobId);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink()) throw new Error('MEDIA_JOB_UNSAFE_ROOT');
    const root = await realpath(this.root);
    const project = join(root, id(this.projectId));
    await mkdir(project, { recursive: true, mode: 0o700 });
    if ((await lstat(project)).isSymbolicLink() || await realpath(project) !== project) throw new Error('MEDIA_JOB_UNSAFE_PROJECT_PATH');
    const path = join(project, jobId);
    await mkdir(path, { recursive: true, mode: 0o700 });
    const resolved = await realpath(path);
    if (relative(root, resolved).startsWith('..') || (await lstat(path)).isSymbolicLink()) throw new Error('MEDIA_JOB_UNSAFE_PATH');
    return path;
  }
  private approval(request: MediaJobRequest, approval: MediaJobApproval): void {
    if (request.projectId !== this.projectId || approval.projectId !== this.projectId || approval.adapterId !== request.adapterId || approval.approved !== true || !approval.sourceRecordId?.trim() || approval.inputFingerprint !== mediaJobInputFingerprint(request) || !Number.isFinite(approval.maxCostUsd) || approval.maxCostUsd < 0 || !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= Date.parse(this.now())) throw new Error('MEDIA_JOB_APPROVAL_MISMATCH');
  }
  async status(jobId: string): Promise<MediaJobRecord> {
    const dir = await this.directory(jobId);
    const records = (await readdir(dir)).filter((name) => /^\d{6}\.json$/.test(name)).sort();
    if (!records.length) throw new Error('MEDIA_JOB_NOT_FOUND');
    const record = JSON.parse(await readFile(join(dir, records.at(-1)!), 'utf8')) as MediaJobRecord;
    if (record.version !== 'fcr/media-job@v1' || record.projectId !== this.projectId || record.jobId !== jobId || jobId !== 'job_' + record.inputFingerprint || record.outputApproval !== 'REVIEW_REQUIRED' || record.publishAuthority !== false) throw new Error('MEDIA_JOB_RECORD_DRIFT');
    return record;
  }
  private async append(dir: string, record: MediaJobRecord): Promise<void> {
    const count = (await readdir(dir)).filter((name) => /^\d{6}\.json$/.test(name)).length;
    await writeFile(join(dir, String(count).padStart(6, '0') + '.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  async queue(request: MediaJobRequest, approval: MediaJobApproval): Promise<MediaJobRecord> {
    id(request.requestId); this.approval(request, approval);
    if (!this.adapters.some((a) => a.id === request.adapterId)) throw new Error('MEDIA_JOB_ADAPTER_NOT_CONFIGURED');
    if (!Array.isArray(request.references) || request.references.length > 32 || new Set(request.references.map((r) => r.id)).size !== request.references.length) throw new Error('MEDIA_JOB_INVALID_REFERENCES');
    const fingerprint = mediaJobInputFingerprint(request);
    const jobId = 'job_' + fingerprint;
    const dir = await this.directory(jobId);
    const lease = await open(join(dir, 'queue.lock'), 'wx', 0o600).catch(() => null);
    if (!lease) return this.status(jobId);
    await lease.close();
    try {
    const references: MediaJobReference[] = [];
    for (const reference of request.references) {
      id(reference.id); sha(reference.sha256);
      if (!isAbsolute(reference.path) || !(await lstat(reference.path)).isFile() || (await lstat(reference.path)).isSymbolicLink()) throw new Error('MEDIA_JOB_INVALID_REFERENCE_PATH');
      const path = join(dir, reference.id + '.reference');
      await copyFile(reference.path, path);
      await chmod(path, 0o600);
      if (await fileHash(path) !== reference.sha256) throw new Error('MEDIA_JOB_REFERENCE_DRIFT');
      references.push({ ...reference, path });
    }
    await writeFile(join(dir, 'input.json'), JSON.stringify({ request, approval, references }, null, 2), { mode: 0o600 });
    const record: MediaJobRecord = { version: 'fcr/media-job@v1', jobId, projectId: this.projectId, adapterId: request.adapterId, inputFingerprint: fingerprint, state: 'QUEUED', recordedAt: this.now(), approvalRecordId: approval.sourceRecordId, outputApproval: 'REVIEW_REQUIRED', publishAuthority: false };
    await this.append(dir, record);
    return record;
    } catch (error) {
      // No provider operation occurs during queueing; permit correcting a local preflight failure.
      await unlink(join(dir, 'queue.lock'));
      throw error;
    }
  }
  async execute(jobId: string, execute: boolean, poll = false): Promise<MediaJobRecord> {
    if (!execute) throw new Error('MEDIA_JOB_EXPLICIT_EXECUTE_REQUIRED');
    const dir = await this.directory(jobId);
    const lease = await open(join(dir, 'execution.lock'), 'wx', 0o600).catch(() => null);
    if (!lease) throw new Error('MEDIA_JOB_EXECUTION_RECONCILIATION_REQUIRED');
    let preserveLease = false;
    try {
      const current = await this.status(jobId);
      if (current.state === 'SUCCEEDED' || current.state === 'FAILED') return current;
      if ((!poll && current.state !== 'QUEUED') || (poll && (current.state !== 'SUBMITTED' || !current.taskId))) throw new Error('MEDIA_JOB_EXECUTION_RECONCILIATION_REQUIRED');
      const saved = JSON.parse(await readFile(join(dir, 'input.json'), 'utf8')) as {request: MediaJobRequest; approval: MediaJobApproval; references: MediaJobReference[]};
      this.approval(saved.request, saved.approval);
      if (mediaJobInputFingerprint(saved.request) !== current.inputFingerprint || saved.request.adapterId !== current.adapterId || saved.approval.sourceRecordId !== current.approvalRecordId) throw new Error('MEDIA_JOB_INPUT_DRIFT');
      if (!Array.isArray(saved.references) || saved.references.length !== saved.request.references.length) throw new Error('MEDIA_JOB_REFERENCE_DRIFT');
      for (let index = 0; index < saved.references.length; index++) {
        const r = saved.references[index]; const approved = saved.request.references[index];
        const expected = join(dir, id(approved.id) + '.reference');
        if (r.id !== approved.id || r.sha256 !== approved.sha256 || r.path !== expected || (await lstat(expected)).isSymbolicLink() || await realpath(expected) !== expected || await fileHash(expected) !== approved.sha256) throw new Error('MEDIA_JOB_REFERENCE_DRIFT');
      }
      const adapter = this.adapters.find((a) => a.id === current.adapterId);
      if (!adapter) throw new Error('MEDIA_JOB_ADAPTER_NOT_CONFIGURED');
      if (!poll) { await this.append(dir, { ...current, state: 'SUBMITTING', recordedAt: this.now() }); preserveLease = true; }
      const result = poll ? await adapter.poll(current.taskId!) : await adapter.submit({ jobId, projectId: this.projectId, inputFingerprint: current.inputFingerprint, request: saved.request.request, references: saved.references, maxCostUsd: saved.approval.maxCostUsd });
      if (!result.taskId?.trim() || !['PENDING', 'SUCCEEDED', 'FAILED'].includes(result.state)) throw new Error('MEDIA_JOB_INVALID_ADAPTER_RESULT');
      if (poll && result.taskId !== current.taskId) throw new Error('MEDIA_JOB_TASK_DRIFT');
      const record: MediaJobRecord = { ...current, taskId: result.taskId, state: result.state === 'PENDING' ? 'SUBMITTED' : result.state, recordedAt: this.now(), result, outputApproval: 'REVIEW_REQUIRED', publishAuthority: false };
      await this.append(dir, record);
      preserveLease = false;
      return record;
    } finally {
      await lease.close();
      // A completed transition can be polled later; an ambiguous call retains its lease.
      if (!preserveLease) await unlink(join(dir, 'execution.lock'));
    }
  }
  async materialize(jobId: string, outputPath: string, execute: boolean, download: (result: MediaJobAdapterResult, path: string) => Promise<MediaJobAdapterResult>): Promise<MediaJobRecord> {
    if (!execute) throw new Error('MEDIA_JOB_EXPLICIT_EXECUTE_REQUIRED');
    const dir = await this.directory(jobId);
    if (!isAbsolute(outputPath) || join(dir, 'candidate.mp4') !== outputPath) throw new Error('MEDIA_JOB_SCOPED_OUTPUT_REQUIRED');
    const lease = await open(join(dir, 'materialization.lock'), 'wx', 0o600).catch(() => null);
    if (!lease) throw new Error('MEDIA_JOB_MATERIALIZATION_RECONCILIATION_REQUIRED');
    try {
      const current = await this.status(jobId);
      if (current.state !== 'SUCCEEDED' || !current.result || !current.taskId || current.result.taskId !== current.taskId || !current.result.output?.uri?.startsWith('https://')) throw new Error('MEDIA_JOB_REMOTE_CANDIDATE_REQUIRED');
      const result = await download(current.result, outputPath);
      if (result.state !== 'SUCCEEDED' || result.taskId !== current.taskId || result.output?.uri !== outputPath || !result.output.sha256 || (await lstat(outputPath)).isSymbolicLink() || await realpath(outputPath) !== outputPath || await fileHash(outputPath) !== result.output.sha256) throw new Error('MEDIA_JOB_MATERIALIZATION_DRIFT');
      const record: MediaJobRecord = { ...current, recordedAt: this.now(), result, outputApproval: 'REVIEW_REQUIRED', publishAuthority: false };
      await this.append(dir, record);
      return record;
    } finally { await lease.close(); /* Keep the lease: a second materialization needs explicit reconciliation. */ }
  }
}
