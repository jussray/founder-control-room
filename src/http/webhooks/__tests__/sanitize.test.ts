import { describe, expect, it } from 'vitest';
import { sanitizeWebhookPayload } from '../sanitize.js';

const SHA = 'a'.repeat(40);

describe('sanitizeWebhookPayload', () => {
  it('retains only typed controller-required pull request metadata', () => {
    const result = sanitizeWebhookPayload('pull_request', {
      action: 'opened',
      repository: {
        full_name: 'jussray/Sekret-Bip',
        private: true,
        owner: { login: 'jussray' },
      },
      pull_request: {
        number: 77,
        title: 'Guard the provider inbox',
        state: 'open',
        merged: false,
        merge_commit_sha: null,
        html_url: 'https://github.com/jussray/Sekret-Bip/pull/77',
        updated_at: '2026-07-22T23:00:00Z',
        body: 'PRIVATE_BODY_MARKER',
        head: { sha: SHA, ref: 'security/inbox', repo: { secret: 'HEAD_REPO_MARKER' } },
        base: { ref: 'main', repo: { secret: 'BASE_REPO_MARKER' } },
        user: { login: 'jussray', avatar_url: 'AVATAR_MARKER' },
        requested_reviewers: [{ login: 'REVIEWER_MARKER' }],
      },
      sender: { login: 'SENDER_MARKER' },
      installation: { id: 123 },
      organization: { login: 'ORG_MARKER' },
    });

    expect(result).toEqual({
      action: 'opened',
      repository: { full_name: 'jussray/Sekret-Bip' },
      pull_request: {
        number: 77,
        title: 'Guard the provider inbox',
        state: 'open',
        merged: false,
        merge_commit_sha: null,
        html_url: 'https://github.com/jussray/Sekret-Bip/pull/77',
        updated_at: '2026-07-22T23:00:00Z',
        head: { sha: SHA, ref: 'security/inbox' },
        base: { ref: 'main' },
        user: { login: 'jussray' },
      },
    });

    const serialized = JSON.stringify(result);
    for (const marker of [
      'PRIVATE_BODY_MARKER',
      'HEAD_REPO_MARKER',
      'BASE_REPO_MARKER',
      'AVATAR_MARKER',
      'REVIEWER_MARKER',
      'SENDER_MARKER',
      'ORG_MARKER',
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it('does not let objects or arrays pass through allowed scalar keys', () => {
    const result = sanitizeWebhookPayload('pull_request', {
      action: { secret: 'ACTION_OBJECT_MARKER' },
      repository: { full_name: { secret: 'REPOSITORY_OBJECT_MARKER' } },
      pull_request: {
        number: [77],
        title: { secret: 'TITLE_OBJECT_MARKER' },
        state: ['open'],
        merged: 'false',
        merge_commit_sha: { secret: 'SHA_OBJECT_MARKER' },
        html_url: { secret: 'URL_OBJECT_MARKER' },
        updated_at: { secret: 'DATE_OBJECT_MARKER' },
        head: { sha: { secret: 'HEAD_SHA_OBJECT_MARKER' }, ref: ['branch'] },
        base: { ref: { secret: 'BASE_REF_OBJECT_MARKER' } },
        user: { login: { secret: 'LOGIN_OBJECT_MARKER' } },
      },
    });

    expect(result).toEqual({
      pull_request: {
        head: { sha: undefined, ref: undefined },
        base: { ref: undefined },
        user: { login: undefined },
      },
    });
    expect(JSON.stringify(result)).not.toContain('MARKER');
  });

  it('bounds text and removes control characters', () => {
    const result = sanitizeWebhookPayload('pull_request', {
      action: `opened\u0000${'x'.repeat(100)}`,
      repository: { full_name: 'jussray/Sekret-Bip' },
      pull_request: {
        title: `Title\n${'y'.repeat(400)}`,
      },
    });

    expect(String(result.action)).not.toContain('\u0000');
    expect(String(result.action)).toHaveLength(64);
    const pullRequest = result.pull_request as Record<string, unknown>;
    expect(String(pullRequest.title)).not.toContain('\n');
    expect(String(pullRequest.title)).toHaveLength(256);
  });

  it('strips credentials, query parameters, and fragments from allowed URLs', () => {
    const result = sanitizeWebhookPayload('check_run', {
      repository: { full_name: 'jussray/founder-control-room' },
      check_run: {
        name: 'CI',
        conclusion: 'success',
        head_sha: SHA,
        details_url: 'https://user:password@example.com/build/77?token=SECRET#logs',
      },
    });

    expect(result).toEqual({
      repository: { full_name: 'jussray/founder-control-room' },
      check_run: {
        name: 'CI',
        conclusion: 'success',
        head_sha: SHA,
        details_url: 'https://example.com/build/77',
      },
    });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('keeps deployment metadata bounded while dropping unknown payload fields', () => {
    const result = sanitizeWebhookPayload('deployment_status', {
      action: 'created',
      repository: { full_name: 'jussray/founder-control-room' },
      deployment: {
        id: 123,
        sha: SHA,
        environment: 'production',
        created_at: '2026-07-22T23:00:00Z',
        payload: { secret: 'DEPLOYMENT_PAYLOAD_MARKER' },
      },
      deployment_status: {
        state: 'success',
        environment_url: 'https://app.example.com/?token=URL_TOKEN_MARKER',
        updated_at: '2026-07-22T23:01:00Z',
        description: 'DESCRIPTION_MARKER',
      },
    });

    expect(result).toEqual({
      action: 'created',
      repository: { full_name: 'jussray/founder-control-room' },
      deployment: {
        id: 123,
        sha: SHA,
        environment: 'production',
        created_at: '2026-07-22T23:00:00Z',
      },
      deployment_status: {
        state: 'success',
        environment_url: 'https://app.example.com/',
        updated_at: '2026-07-22T23:01:00Z',
      },
    });
    expect(JSON.stringify(result)).not.toContain('MARKER');
  });
});
