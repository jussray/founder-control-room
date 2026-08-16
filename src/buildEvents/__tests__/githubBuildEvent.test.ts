import { describe, expect, it } from 'vitest';
import { githubWebhookToBuildEvent } from '../githubBuildEvent.js';

const SHA = 'a'.repeat(40);

describe('GitHub build-event projection', () => {
  it('turns a main push into verified source truth', () => {
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
      commitSha: SHA,
    });
  });

  it('turns a workflow run into exact-head verification truth', () => {
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

  it('returns null when exact commit evidence is missing', () => {
    const event = githubWebhookToBuildEvent('workflow_run', 'delivery-missing', {
      repository: { full_name: 'jussray/founder-control-room' },
      workflow_run: {
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
      },
    }, '2026-08-16T03:03:00Z');

    expect(event).toBeNull();
  });
});
