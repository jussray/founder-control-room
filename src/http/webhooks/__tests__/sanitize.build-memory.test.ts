import { describe, expect, it } from 'vitest';
import { sanitizeWebhookPayload } from '../sanitize.js';

const SHA = 'a'.repeat(40);
const BEFORE = 'b'.repeat(40);

describe('build-memory webhook sanitization', () => {
  it('retains only the bounded push fields needed for exact source truth', () => {
    const result = sanitizeWebhookPayload('push', {
      repository: { full_name: 'jussray/founder-control-room', private: true },
      ref: 'refs/heads/main',
      before: BEFORE,
      after: SHA,
      forced: false,
      compare: `https://github.com/jussray/founder-control-room/compare/${BEFORE}...${SHA}?token=secret#diff`,
      commits: [{ message: 'PRIVATE_COMMIT_MESSAGE' }],
      pusher: { email: 'PRIVATE_EMAIL' },
    });

    expect(result).toEqual({
      repository: { full_name: 'jussray/founder-control-room' },
      ref: 'refs/heads/main',
      before: BEFORE,
      after: SHA,
      forced: false,
      compare: `https://github.com/jussray/founder-control-room/compare/${BEFORE}...${SHA}`,
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it('retains workflow identity without logs, actors, or raw provider payloads', () => {
    const result = sanitizeWebhookPayload('workflow_run', {
      repository: { full_name: 'jussray/founder-control-room' },
      action: 'completed',
      workflow_run: {
        id: 123,
        name: 'CI',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        head_sha: SHA,
        head_branch: 'main',
        html_url: 'https://github.com/jussray/founder-control-room/actions/runs/123?token=secret#job',
        run_started_at: '2026-08-16T03:00:00Z',
        updated_at: '2026-08-16T03:01:00Z',
        actor: { login: 'PRIVATE_ACTOR' },
        head_commit: { message: 'PRIVATE_MESSAGE' },
        jobs_url: 'https://api.github.com/private/jobs',
      },
    });

    expect(result).toEqual({
      repository: { full_name: 'jussray/founder-control-room' },
      action: 'completed',
      workflow_run: {
        id: 123,
        name: 'CI',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        head_sha: SHA,
        head_branch: 'main',
        html_url: 'https://github.com/jussray/founder-control-room/actions/runs/123',
        run_started_at: '2026-08-16T03:00:00Z',
        updated_at: '2026-08-16T03:01:00Z',
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
});
