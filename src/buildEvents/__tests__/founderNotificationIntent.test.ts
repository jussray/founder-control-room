import { test } from 'vitest';
import assert from 'node:assert/strict';
import { githubNotificationIntent } from '../founderNotificationIntent.js';

const sha = 'a'.repeat(40);
const repo = { full_name: 'example/project' };
const workflow = { id: 42, run_attempt: 2, name: 'CI', status: 'completed', conclusion: 'success', head_sha: sha, head_branch: 'main', updated_at: '2026-11-24T12:00:00Z' };

test('completed workflow success yields a CI receipt, not production proof', () => {
  const result = githubNotificationIntent('workflow_run', { repository: repo, action: 'completed', workflow_run: workflow });
  assert.equal(result?.kind, 'workflow_passed');
  assert.equal(result?.key, 'github:example/project:workflow:42:2');
  assert.equal(result?.commitSha, sha);
  assert.equal(result?.evidenceUrl, 'https://github.com/example/project/actions/runs/42/attempts/2');
});

test('failure, skipped, or nonterminal runs never produce a success intent', () => {
  for (const conclusion of ['failure', 'skipped', 'cancelled', null]) {
    assert.equal(githubNotificationIntent('workflow_run', { repository: repo, action: 'completed', workflow_run: { ...workflow, conclusion } }), null);
  }
  assert.equal(githubNotificationIntent('workflow_run', { repository: repo, action: 'requested', workflow_run: { ...workflow, status: 'queued' } }), null);
});

test('reruns have distinct keys while redelivery retains the same key', () => {
  const make = (run_attempt: number) => githubNotificationIntent('workflow_run', { repository: repo, action: 'completed', workflow_run: { ...workflow, run_attempt } });
  assert.equal(make(2)?.key, make(2)?.key);
  assert.notEqual(make(1)?.key, make(2)?.key);
});

test('closed but unmerged pull requests never yield a merge receipt', () => {
  const pull_request = { number: 7, merged: true, state: 'closed', merge_commit_sha: sha, base: { ref: 'main' }, updated_at: workflow.updated_at };
  const result = githubNotificationIntent('pull_request', { repository: repo, action: 'closed', pull_request });
  assert.equal(result?.kind, 'pull_request_merged');
  assert.equal(result?.commitSha, sha);
  assert.equal(result?.branch, 'main');
  assert.equal(githubNotificationIntent('pull_request', { repository: repo, action: 'closed', pull_request: { ...pull_request, merged: false } }), null);
});

test('deployment success retains environment without asserting live verification', () => {
  const deployment = { id: 8, sha, environment: 'preview' };
  const deployment_status = { state: 'success', updated_at: workflow.updated_at };
  const result = githubNotificationIntent('deployment_status', { repository: repo, deployment, deployment_status });
  assert.equal(result?.kind, 'deployment_succeeded');
  assert.equal(result?.environment, 'preview');
  assert.equal(githubNotificationIntent('deployment_status', { repository: repo, deployment, deployment_status: { ...deployment_status, state: 'failure' } }), null);
});

test('untrusted metadata cannot override evidence links and malformed identities are rejected', () => {
  const result = githubNotificationIntent('workflow_run', { repository: repo, action: 'completed', workflow_run: { ...workflow, html_url: 'https://evil.example/secret', token: 'secret' } });
  assert.equal(result?.evidenceUrl, 'https://github.com/example/project/actions/runs/42/attempts/2');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(githubNotificationIntent('workflow_run', { repository: { full_name: 'example/..' }, action: 'completed', workflow_run: workflow }), null);
  assert.equal(githubNotificationIntent('workflow_run', { repository: repo, action: 'completed', workflow_run: { ...workflow, head_sha: '0'.repeat(40) } }), null);
});
