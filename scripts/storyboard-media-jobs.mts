/** Private operator command: no credentials, provider calls or automatic submission. */
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DurableMediaJobs, type MediaJobApproval } from '../src/lib/mediaJobExecution.js';
import { RunwayMediaJobAdapter } from '../src/lib/runwayMediaJobAdapter.js';
import { compileStoryboardMediaJobs, queueStoryboardMediaJobs, storyboardJobFingerprint, type PrivateStoryboard, type StoryboardSourceBinding } from '../src/lib/storyboardMediaJobBridge.js';
function arg(name: string): string { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('ARG_REQUIRED'); return process.argv[i + 1]; }
async function json(path: string): Promise<unknown> {
  const file = await open(resolve(path), 'r');
  try { if ((await file.stat()).size > 2_000_000) throw new Error('INPUT_TOO_LARGE'); return JSON.parse(await file.readFile('utf8')); } finally { await file.close(); }
}
try {
  const action = arg('--action');
  const storyboard = await json(arg('--storyboard')) as PrivateStoryboard;
  if (action === 'fingerprint') {
    console.log(JSON.stringify({ storyboardFingerprint: storyboardJobFingerprint(storyboard) }));
  } else {
    if (!['compile', 'queue'].includes(action)) throw new Error('ACTION_INVALID');
    const binding = await json(arg('--binding')) as StoryboardSourceBinding;
    const plan = compileStoryboardMediaJobs(storyboard, binding);
    // Reserve without overwriting before queueing; private prompts never go to stdout.
    const output = await open(resolve(arg('--output')), 'wx', 0o600);
    try {
      if (action === 'compile') await output.writeFile(JSON.stringify(plan, null, 2) + '\n');
      else {
        const approvals = await json(arg('--approvals')) as MediaJobApproval[];
        const jobs = new DurableMediaJobs(resolve(arg('--root')), storyboard.projectId, [new RunwayMediaJobAdapter()]);
        const result = await queueStoryboardMediaJobs({ storyboard, binding, approvals, jobs });
        await output.writeFile(JSON.stringify(result, null, 2) + '\n');
      }
    } catch {
      await output.writeFile(JSON.stringify({ state: 'FAILED_RECONCILE_QUEUED_JOBS_BEFORE_RETRY', publishAuthority: false }) + '\n');
      throw new Error('FAILED');
    } finally { await output.close(); }
    console.log(JSON.stringify({ state: action === 'compile' ? 'COMPILED' : 'QUEUED', storyboardFingerprint: plan.storyboardFingerprint, shots: plan.shots.length, totalSeconds: plan.totalSeconds, outputApproval: 'REVIEW_REQUIRED', publishAuthority: false }));
  }
} catch {
  console.error(JSON.stringify({ state: 'FAILED', code: 'STORYBOARD_MEDIA_COMMAND_FAILED' }));
  process.exitCode = 1;
}
