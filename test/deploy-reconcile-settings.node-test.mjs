import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const JOB_KEY = /^ {2}[A-Za-z0-9_-]+:\s*$/;

// Returns the lines of the top-level job (2-space key) whose `name:` equals jobName.
function jobBlock(source, jobName) {
  const lines = source.split('\n');
  const nameLine = lines.findIndex(line => line === `    name: ${jobName}`);
  assert.notEqual(nameLine, -1, `job named "${jobName}" not found`);
  let start = nameLine;
  while (start > 0 && !JOB_KEY.test(lines[start])) start -= 1;
  let end = nameLine + 1;
  while (end < lines.length && !JOB_KEY.test(lines[end]) && !/^\S/.test(lines[end])) end += 1;
  return lines.slice(start, end);
}

const reconcile = jobBlock(workflow, 'Post-Deploy Reconciliation');

test('post-deploy reconciliation keeps its 15-minute job timeout', () => {
  assert.ok(
    reconcile.some(line => line === '    timeout-minutes: 15'),
    'reconcile job must declare job-level timeout-minutes: 15 so it cannot run for the 6-hour default',
  );
});

test('post-deploy reconciliation stays non-blocking after the Worker is live', () => {
  assert.ok(
    reconcile.some(line => line === '    continue-on-error: true'),
    'reconcile job must declare job-level continue-on-error: true',
  );
});
