import { describe, expect, it } from 'vitest';
import { githubNotificationIntent } from '../../buildEvents/founderNotificationIntent.js';
import { notificationEventRow } from '../founderNotificationQueue.js';

describe('founder notification queue', () => {
  const input = { repository: { full_name: 'example/project' }, action: 'completed', workflow_run: { id: 19, run_attempt: 2, status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40), updated_at: '2026-11-24T12:00:00Z' } };
  it('creates a stable queued event without claiming delivery', () => {
    const intent = githubNotificationIntent('workflow_run', input)!;
    const first = notificationEventRow('project-1', intent);
    expect(first).toEqual(notificationEventRow('project-1', intent));
    expect(first.source_event_id).toMatch(/^founder-notification:[0-9a-f]{64}$/);
    expect(first.metadata.delivery).toBe('queued');
    expect(first.metadata.intent.kind).toBe('workflow_passed');
    expect(first.event_type).toBe('founder_notification_intent');
  });
  it('does not merge identities across rerun attempts', () => {
    const one = githubNotificationIntent('workflow_run', input)!;
    const two = githubNotificationIntent('workflow_run', { ...input, workflow_run: { ...input.workflow_run, run_attempt: 3 } })!;
    expect(notificationEventRow('project-1', one).source_event_id).not.toBe(notificationEventRow('project-1', two).source_event_id);
  });
});
