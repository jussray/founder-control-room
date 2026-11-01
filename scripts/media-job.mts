import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DurableMediaJobs, mediaJobInputFingerprint, type MediaJobApproval, type MediaJobRequest, type MediaJobRecord, type MediaJobAdapter } from '../src/lib/mediaJobExecution.js';
import { LocalFfmpegJobAdapter } from '../src/lib/localFfmpegJobAdapter.js';
import { RunwayMediaJobAdapter, materializeRunwayOutput, type RunwayMediaJobOptions } from '../src/lib/runwayMediaJobAdapter.js';

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
async function json(path: string): Promise<unknown> {
  const bytes = await readFile(resolve(path));
  if (bytes.length > 2_000_000) throw new Error('MEDIA_JOB_INPUT_TOO_LARGE');
  return JSON.parse(bytes.toString('utf8'));
}
function summary(record: MediaJobRecord): unknown {
  return { version: record.version, jobId: record.jobId, projectId: record.projectId, adapterId: record.adapterId, state: record.state, inputFingerprint: record.inputFingerprint, outputSha256: record.result?.output?.sha256 ?? null, outputApproval: record.outputApproval, publishAuthority: false };
}
try {
  const root = arg('--root'); const project = arg('--project'); const action = arg('--action');
  if (action === 'fingerprint') {
    const input = arg('--input'); if (!input) throw new Error('MEDIA_JOB_INPUT_REQUIRED');
    console.log(JSON.stringify({ inputFingerprint: mediaJobInputFingerprint(await json(input) as MediaJobRequest) }));
    process.exit(0);
  }
  if (!root || !project || !['queue', 'submit', 'poll', 'status', 'materialize'].includes(action ?? '')) throw new Error('MEDIA_JOB_USAGE');
  const adapters: MediaJobAdapter[] = [new LocalFfmpegJobAdapter(join(resolve(root), project, 'outputs'))];
  let providerOptions: RunwayMediaJobOptions | undefined;
  if (arg('--adapter') === 'runway-image-to-video@v1') {
    const config = arg('--provider-config');
    if (!config) throw new Error('MEDIA_JOB_PROVIDER_CONFIGURATION_REQUIRED');
    const options = await json(config) as RunwayMediaJobOptions;
    providerOptions = options;
    // Credentials remain in the operator environment. Configuration never grants job approval.
    adapters.push(new RunwayMediaJobAdapter({
      allowedProjectIds: options.allowedProjectIds,
      generationEligibility: options.generationEligibility,
      maxCostUsdLimit: options.maxCostUsdLimit,
      allowedOutputHosts: options.allowedOutputHosts,
      apiKey: process.env.RUNWAY_API_SECRET,
      enabled: process.argv.includes('--execute'),
      authorize: async () => true, // Called only after DurableMediaJobs validates the exact saved approval.
    }));
  }
  const jobs = new DurableMediaJobs(resolve(root), project, adapters);
  let result: MediaJobRecord;
  if (action === 'queue') {
    const input = arg('--input'); const approval = arg('--approval');
    if (!input || !approval) throw new Error('MEDIA_JOB_APPROVAL_FILE_REQUIRED');
    result = await jobs.queue(await json(input) as MediaJobRequest, await json(approval) as MediaJobApproval);
  } else {
    const jobId = arg('--job'); if (!jobId) throw new Error('MEDIA_JOB_ID_REQUIRED');
    if (action === 'materialize') {
      const output = arg('--output');
      const current = await jobs.status(jobId);
      if (!output || !providerOptions || current.adapterId !== 'runway-image-to-video@v1' || !providerOptions.allowedProjectIds?.includes(project)) throw new Error('MEDIA_JOB_MATERIALIZATION_CONFIGURATION_REQUIRED');
      result = await jobs.materialize(jobId, resolve(output), process.argv.includes('--execute'), (candidate, path) => materializeRunwayOutput(candidate, path, { allowedOutputHosts: providerOptions?.allowedOutputHosts }));
    } else result = action === 'status' ? await jobs.status(jobId) : await jobs.execute(jobId, process.argv.includes('--execute'), action === 'poll');
  }
  console.log(JSON.stringify(summary(result), null, 2));
  if (result.state === 'FAILED') process.exitCode = 1;
} catch {
  // Do not echo request contents, filesystem paths, raw provider failures or credentials.
  console.error(JSON.stringify({ kind: 'FAILED', code: 'MEDIA_JOB_COMMAND_FAILED' }));
  process.exitCode = 1;
}
