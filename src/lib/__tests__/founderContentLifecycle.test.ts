import { describe, expect, it } from 'vitest';
import {
  FOUNDER_CONTENT_LIFECYCLE_OPERATIONS,
  FOUNDER_CONTENT_LIFECYCLE_POLICY,
  approveFounderContentPost,
  beginFounderContentPublishNow,
  bulkScheduleFounderContentPosts,
  createFounderContentLifecyclePost,
  finalizeFounderContentPublish,
  recordFounderContentMetricsSync,
  rejectFounderContentPost,
  rescheduleFounderContentPost,
  retryFounderContentPost,
} from '../founderContentLifecycle.js';

const HASH = 'a'.repeat(64);
const NOW = '2026-09-07T15:00:00.000Z';
const EXPIRES = '2026-09-07T16:00:00.000Z';

function post(overrides: Record<string, unknown> = {}) {
  return {
    ...createFounderContentLifecyclePost({
      postId: 'post-1',
      platform: 'linkedin',
      accountId: 'founder-linkedin',
      contentHash: HASH,
      mediaCount: 1,
    }),
    ...overrides,
  };
}

function approvedPost() {
  return approveFounderContentPost(post(), {
    approvalId: 'approval-current',
    expiresAt: EXPIRES,
    now: NOW,
  });
}

describe('founder content lifecycle donor reconstruction', () => {
  it('captures the complete 17-operation lifecycle without hard-coding LinkedIn into the core account operations', () => {
    expect(FOUNDER_CONTENT_LIFECYCLE_OPERATIONS).toHaveLength(17);
    expect(FOUNDER_CONTENT_LIFECYCLE_OPERATIONS).toContain('connect_account');
    expect(FOUNDER_CONTENT_LIFECYCLE_OPERATIONS).toContain('list_accounts');
    expect(FOUNDER_CONTENT_LIFECYCLE_OPERATIONS).toContain('create_post_draft');
    expect(FOUNDER_CONTENT_LIFECYCLE_OPERATIONS).toContain('publish_now');
    expect(FOUNDER_CONTENT_LIFECYCLE_OPERATIONS).not.toContain('connect_linkedin' as never);
    expect(FOUNDER_CONTENT_LIFECYCLE_OPERATIONS).not.toContain('list_linkedin_accounts' as never);
  });

  it('makes publish_now the only immediate provider publication mutation', () => {
    const immediate = FOUNDER_CONTENT_LIFECYCLE_OPERATIONS.filter(
      (operation) => FOUNDER_CONTENT_LIFECYCLE_POLICY[operation].publishesImmediately,
    );
    expect(immediate).toEqual(['publish_now']);
    expect(FOUNDER_CONTENT_LIFECYCLE_POLICY.publish_now).toMatchObject({
      effect: 'provider_write',
      currentFounderApprovalRequired: true,
      explicitPublicationConfirmationRequired: true,
      providerReadbackRequired: true,
      retryExecutesProviderWrite: false,
    });
  });

  it('keeps approval local and does not manufacture publication truth', () => {
    const approved = approvedPost();
    expect(approved.status).toBe('approved');
    expect(approved.providerWriteState).toBe('not_attempted');
    expect(approved.externalPostId).toBeNull();
    expect(approved.postedAt).toBeNull();
    expect(FOUNDER_CONTENT_LIFECYCLE_POLICY.approve_post.publishesImmediately).toBe(false);
  });

  it('records schedule intent without performing a provider write', () => {
    const approved = approvedPost();
    const scheduled = rescheduleFounderContentPost(approved, '2026-09-07T15:30:00.000Z');
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.scheduledAt).toBe('2026-09-07T15:30:00.000Z');
    expect(scheduled.providerWriteState).toBe('not_attempted');
    expect(FOUNDER_CONTENT_LIFECYCLE_POLICY.reschedule_post.effect).toBe('local_state');
  });

  it('preserves pending approval when a schedule is selected before approval', () => {
    const scheduledIntent = rescheduleFounderContentPost(
      post(),
      '2026-09-07T15:30:00.000Z',
    );
    expect(scheduledIntent.status).toBe('pending_approval');
    const approved = approveFounderContentPost(scheduledIntent, {
      approvalId: 'approval-current',
      expiresAt: EXPIRES,
      now: NOW,
    });
    expect(approved.status).toBe('scheduled');
  });

  it('bulk-schedules deterministically while remaining provider-write free', () => {
    const posts = [
      approvedPost(),
      { ...approvedPost(), postId: 'post-2' },
      { ...approvedPost(), postId: 'post-3' },
    ];
    const scheduled = bulkScheduleFounderContentPosts(
      posts,
      '2026-09-07T15:30:00.000Z',
      45,
    );
    expect(scheduled.map((item) => item.scheduledAt)).toEqual([
      '2026-09-07T15:30:00.000Z',
      '2026-09-07T16:15:00.000Z',
      '2026-09-07T17:00:00.000Z',
    ]);
    expect(scheduled.every((item) => item.providerWriteState === 'not_attempted')).toBe(true);
  });

  it('requires exact current approval and explicit confirmation before provider mutation', () => {
    const approved = approvedPost();
    expect(() => beginFounderContentPublishNow(approved, {
      confirmPublication: false,
      approvalId: 'approval-current',
      now: '2026-09-07T15:10:00.000Z',
    })).toThrow(/explicit publication confirmation is required/);

    expect(() => beginFounderContentPublishNow(approved, {
      confirmPublication: true,
      approvalId: 'approval-stale',
      now: '2026-09-07T15:10:00.000Z',
    })).toThrow(/exact current approval/);

    const publishing = beginFounderContentPublishNow(approved, {
      confirmPublication: true,
      approvalId: 'approval-current',
      now: '2026-09-07T15:10:00.000Z',
    });
    expect(publishing.status).toBe('publishing');
    expect(publishing.providerWriteState).toBe('attempted');
  });

  it('expires approval instead of inheriting stale publication authority', () => {
    const approved = approveFounderContentPost(post(), {
      approvalId: 'approval-current',
      expiresAt: '2026-09-07T15:05:00.000Z',
      now: NOW,
    });
    expect(() => beginFounderContentPublishNow(approved, {
      confirmPublication: true,
      approvalId: 'approval-current',
      now: '2026-09-07T15:05:00.000Z',
    })).toThrow(/approval expired/);
  });

  it('requires provider-native publication readback before posted becomes true', () => {
    const publishing = beginFounderContentPublishNow(approvedPost(), {
      confirmPublication: true,
      approvalId: 'approval-current',
      now: '2026-09-07T15:10:00.000Z',
    });
    const posted = finalizeFounderContentPublish(publishing, {
      outcome: 'published',
      externalPostId: 'urn:provider:post:123',
      permalink: 'https://social.example/posts/123',
      publishedAt: '2026-09-07T15:10:05.000Z',
    });
    expect(posted.status).toBe('posted');
    expect(posted.providerWriteState).toBe('verified_published');
    expect(posted.externalPostId).toBe('urn:provider:post:123');
  });

  it('turns an ambiguous provider result into outcome_unknown and forbids blind retry', () => {
    const publishing = beginFounderContentPublishNow(approvedPost(), {
      confirmPublication: true,
      approvalId: 'approval-current',
      now: '2026-09-07T15:10:00.000Z',
    });
    const unknown = finalizeFounderContentPublish(publishing, {
      outcome: 'unknown',
      error: 'provider connection dropped after request transmission',
    });
    expect(unknown.status).toBe('outcome_unknown');
    expect(unknown.providerWriteState).toBe('unknown');
    expect(() => retryFounderContentPost({ ...unknown, status: 'failed' })).toThrow(
      /cannot be retried without provider readback/,
    );
  });

  it('allows only verified provider failure to reset to a fresh approval gate', () => {
    const publishing = beginFounderContentPublishNow(approvedPost(), {
      confirmPublication: true,
      approvalId: 'approval-current',
      now: '2026-09-07T15:10:00.000Z',
    });
    const failed = finalizeFounderContentPublish(publishing, {
      outcome: 'failed',
      error: 'provider explicitly rejected the request before publication',
    });
    const retry = retryFounderContentPost(failed);
    expect(retry.status).toBe('pending_approval');
    expect(retry.providerWriteState).toBe('not_attempted');
    expect(retry.approvalId).toBeNull();
    expect(retry.approvalExpiresAt).toBeNull();
    expect(retry.retryCount).toBe(1);
  });

  it('keeps metrics synchronization observational', () => {
    const posted = {
      ...approvedPost(),
      status: 'posted' as const,
      providerWriteState: 'verified_published' as const,
      externalPostId: 'provider-post-1',
      permalink: 'https://social.example/posts/1',
      postedAt: '2026-09-07T15:10:05.000Z',
    };
    const synced = recordFounderContentMetricsSync(
      posted,
      '2026-09-07T15:40:00.000Z',
    );
    expect(synced.status).toBe('posted');
    expect(synced.lastMetricsSyncAt).toBe('2026-09-07T15:40:00.000Z');
    expect(FOUNDER_CONTENT_LIFECYCLE_POLICY.sync_post_metrics.effect).toBe('provider_read');
  });

  it('allows rejection before provider mutation but not after publication or ambiguous mutation', () => {
    expect(rejectFounderContentPost(post(), 'not this version').status).toBe('rejected');
    expect(() => rejectFounderContentPost({ ...approvedPost(), status: 'posted' })).toThrow(
      /cannot be rejected locally/,
    );
    expect(() => rejectFounderContentPost({ ...approvedPost(), status: 'outcome_unknown' })).toThrow(
      /cannot be rejected locally/,
    );
  });
});
