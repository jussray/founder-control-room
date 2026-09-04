import { describe, expect, it } from 'vitest';
import { githubWebhookToBuildEvent } from '../githubBuildEvent.js';

const SHA = 'a'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);

describe('GitHub build-event projection', () => {
  it('turns a main push into verified branch-head truth', () => {
    const event = githubWebhookToBuildEvent('push', 'delivery-push', {
      repository: { full_name: 'jussray/founder-control-room' },
      ref: 'refs/heads/main',
      after: SHA,
      compare: `https://github.com/jussray/founder-control-room/compare/${'b'.repeat(40)}...${SHA}`,
    }, '2026-08-16T03:00:00Z');

    expect(event).not.toBeNull();
    expect(event?.category).toBe('source');
    expect(event?.truth).toBe('verified');
    expect(event?.repository).toEqual({
      name: 'jussray/founder-control-room',
      branch: 'main',
      refKind: 'branch-head',
      commitSha: SHA,
    });
  });

  it('marks pull-request heads separately even when their branch is named main', () => {
    const event = githubWebhookToBuildEvent('pull_request', 'delivery-pr', {
      repository: { full_name: 'jussray/founder-control-room' },
      pull_request: {
        number: 55,
        state: 'open',
        merged: false,
        html_url: 'https://github.com/jussray/founder-control-room/pull/55',
        head: { sha: SHA, ref: 'main' },
      },
    }, '2026-08-16T03:00:30Z');

    expect(event?.repository).toEqual({
      name: 'jussray/founder-control-room',
      branch: 'main',
      refKind: 'proposal-head',
      commitSha: SHA,
    });
  });

  it('binds a merged pull request to the landed merge SHA on the base branch', () => {
    const event = githubWebhookToBuildEvent('pull_request', 'delivery-merged', {
      repository: { full_name: 'jussray/founder-control-room' },
      pull_request: {
        number: 56,
        state: 'closed',
        merged: true,
        merge_commit_sha: MERGE_SHA,
        html_url: 'https://github.com/jussray/founder-control-room/pull/56',
        head: { sha: SHA, ref: 'fix/content' },
        base: { ref: 'main' },
      },
    }, '2026-08-16T03:00:45Z');

    expect(event?.status).toBe('completed');
    expect(event?.repository).toEqual({
      name: 'jussray/founder-control-room',
      branch: 'main',
      refKind: 'branch-head',
      commitSha: MERGE_SHA,
      auditedCommitSha: SHA,
    });
  });

  it('fails closed when a merged pull request lacks landed merge identity', () => {
    const event = githubWebhookToBuildEvent('pull_request', 'delivery-merged-missing', {
      repository: { full_name: 'jussray/founder-control-room' },
      pull_request: {
        number: 57,
        state: 'closed',
        merged: true,
        merge_commit_sha: null,
        head: { sha: SHA, ref: 'fix/content' },
        base: { ref: 'main' },
      },
    }, '2026-08-16T03:00:50Z');

    expect(event).toBeNull();
  });

  it('turns a workflow run into exact-head verification truth without claiming branch ownership', () => {
    const event = githubWebhookToBuildEvent('workflow_run', 'delivery-workflow', {
      repository: { full_name: 'jussray/founder-control-room' },
      workflow_run: {
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        head_sha: SHA,
        head_branch: 'main',
        html_url: 'https://github.com/jussray/founder-control-room/actions/runs/123',
      },
    }, '2026-08-16T03:01:00Z');

    expect(event?.status).toBe('passed');
    expect(event?.verification).toEqual({
      kind: 'CI',
      status: 'passed',
      exactCommitSha: SHA,
    });
    expect(event?.repository?.branch).toBe('main');
    expect(event?.repository?.refKind).toBe('detached');
  });

  it('keeps deployment success as provider observation instead of runtime proof', () => {
    const event = githubWebhookToBuildEvent('deployment_status', 'delivery-deploy', {
      repository: { full_name: 'jussray/Sekret-Bip' },
      deployment: {
        id: 77,
        sha: SHA,
        environment: 'production',
      },
      deployment_status: {
        state: 'success',
        environment_url: 'https://api.sekretbip.net/',
      },
    }, '2026-08-16T03:02:00Z');

    expect(event?.category).toBe('provider');
    expect(event?.status).toBe('passed');
    expect(event?.provider).toEqual({
      name: 'github',
      resource: 'deployment:77',
      environment: 'production',
    });
    expect(event?.runtime).toBeUndefined();
  });

  it('returns null when exact commit evidence is missing or a branch deletion reports the zero SHA', () => {
    const missing = githubWebhookToBuildEvent('workflow_run', 'delivery-missing', {
      repository: { full_name: 'jussray/founder-control-room' },
      workflow_run: {
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
      },
    }, '2026-08-16T03:03:00Z');

    const deleted = githubWebhookToBuildEvent('push', 'delivery-delete', {
      repository: { full_name: 'jussray/founder-control-room' },
      ref: 'refs/heads/main',
      after: '0'.repeat(40),
    }, '2026-08-16T03:04:00Z');

    expect(missing).toBeNull();
    expect(deleted).toBeNull();
  });
});
