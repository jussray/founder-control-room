import type { FirstPartySocialPlatform } from './firstPartySocialPublisher.js';

export const FOUNDER_CONTENT_LIFECYCLE_CONTRACT =
  'fcr/founder-content-lifecycle@v1' as const;

export const FOUNDER_CONTENT_LIFECYCLE_OPERATIONS = [
  'get_analytics',
  'get_logs',
  'get_post',
  'get_post_status',
  'list_accounts',
  'list_post_comments',
  'list_posts',
  'add_post_comment',
  'approve_post',
  'bulk_schedule_posts',
  'connect_account',
  'create_post_draft',
  'publish_now',
  'reject_post',
  'reschedule_post',
  'retry_post',
  'sync_post_metrics',
] as const;

export type FounderContentLifecycleOperation =
  (typeof FOUNDER_CONTENT_LIFECYCLE_OPERATIONS)[number];

export type FounderContentLifecycleEffect =
  | 'read_only'
  | 'local_state'
  | 'oauth_handoff'
  | 'provider_read'
  | 'provider_write';

export interface FounderContentLifecycleOperationPolicy {
  operation: FounderContentLifecycleOperation;
  effect: FounderContentLifecycleEffect;
  authenticatedActorRequired: boolean;
  currentFounderApprovalRequired: boolean;
  explicitPublicationConfirmationRequired: boolean;
  providerReadbackRequired: boolean;
  publishesImmediately: boolean;
  retryExecutesProviderWrite: boolean;
}

const READ_ONLY_POLICY = {
  effect: 'read_only',
  authenticatedActorRequired: true,
  currentFounderApprovalRequired: false,
  explicitPublicationConfirmationRequired: false,
  providerReadbackRequired: false,
  publishesImmediately: false,
  retryExecutesProviderWrite: false,
} as const;

const PROVIDER_READ_POLICY = {
  effect: 'provider_read',
  authenticatedActorRequired: true,
  currentFounderApprovalRequired: false,
  explicitPublicationConfirmationRequired: false,
  providerReadbackRequired: true,
  publishesImmediately: false,
  retryExecutesProviderWrite: false,
} as const;

export const FOUNDER_CONTENT_LIFECYCLE_POLICY: Record<
  FounderContentLifecycleOperation,
  FounderContentLifecycleOperationPolicy
> = {
  get_analytics: { operation: 'get_analytics', ...READ_ONLY_POLICY },
  get_logs: { operation: 'get_logs', ...READ_ONLY_POLICY },
  get_post: { operation: 'get_post', ...READ_ONLY_POLICY },
  get_post_status: { operation: 'get_post_status', ...PROVIDER_READ_POLICY },
  list_accounts: { operation: 'list_accounts', ...READ_ONLY_POLICY },
  list_post_comments: { operation: 'list_post_comments', ...READ_ONLY_POLICY },
  list_posts: { operation: 'list_posts', ...READ_ONLY_POLICY },
  add_post_comment: {
    operation: 'add_post_comment',
    effect: 'local_state',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: false,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  approve_post: {
    operation: 'approve_post',
    effect: 'local_state',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: true,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  bulk_schedule_posts: {
    operation: 'bulk_schedule_posts',
    effect: 'local_state',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: true,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  connect_account: {
    operation: 'connect_account',
    effect: 'oauth_handoff',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: false,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  create_post_draft: {
    operation: 'create_post_draft',
    effect: 'local_state',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: false,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  publish_now: {
    operation: 'publish_now',
    effect: 'provider_write',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: true,
    explicitPublicationConfirmationRequired: true,
    providerReadbackRequired: true,
    publishesImmediately: true,
    retryExecutesProviderWrite: false,
  },
  reject_post: {
    operation: 'reject_post',
    effect: 'local_state',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: false,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  reschedule_post: {
    operation: 'reschedule_post',
    effect: 'local_state',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: true,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  retry_post: {
    operation: 'retry_post',
    effect: 'local_state',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: false,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: false,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
  sync_post_metrics: {
    operation: 'sync_post_metrics',
    effect: 'provider_read',
    authenticatedActorRequired: true,
    currentFounderApprovalRequired: false,
    explicitPublicationConfirmationRequired: false,
    providerReadbackRequired: true,
    publishesImmediately: false,
    retryExecutesProviderWrite: false,
  },
};

export const FOUNDER_CONTENT_POST_STATUSES = [
  'pending_approval',
  'approved',
  'scheduled',
  'publishing',
  'posted',
  'rejected',
  'failed',
  'outcome_unknown',
] as const;

export type FounderContentPostStatus =
  (typeof FOUNDER_CONTENT_POST_STATUSES)[number];

export type FounderContentProviderWriteState =
  | 'not_attempted'
  | 'attempted'
  | 'verified_published'
  | 'verified_failed'
  | 'unknown';

export interface FounderContentLifecyclePost {
  contract: typeof FOUNDER_CONTENT_LIFECYCLE_CONTRACT;
  postId: string;
  platform: FirstPartySocialPlatform;
  accountId: string;
  status: FounderContentPostStatus;
  contentHash: string;
  mediaCount: number;
  approvalId: string | null;
  approvalExpiresAt: string | null;
  scheduledAt: string | null;
  postedAt: string | null;
  externalPostId: string | null;
  permalink: string | null;
  retryCount: number;
  lastError: string | null;
  providerWriteState: FounderContentProviderWriteState;
  lastMetricsSyncAt: string | null;
}

export interface CreateFounderContentLifecyclePostInput {
  postId: string;
  platform: FirstPartySocialPlatform;
  accountId: string;
  contentHash: string;
  mediaCount?: number;
  scheduledAt?: string | null;
}

export interface FounderContentApprovalInput {
  approvalId: string;
  expiresAt: string;
  now: string;
}

export interface FounderContentPublishConfirmation {
  confirmPublication: boolean;
  approvalId: string;
  now: string;
}

export type FounderContentPublicationReadback =
  | {
      outcome: 'published';
      externalPostId: string;
      permalink: string;
      publishedAt: string;
    }
  | {
      outcome: 'failed';
      error: string;
    }
  | {
      outcome: 'unknown';
      error?: string | null;
    };

export interface FounderContentProviderLifecycleRequest {
  operation: FounderContentLifecycleOperation;
  platform: FirstPartySocialPlatform;
  postId?: string | null;
  accountId?: string | null;
  payload?: Readonly<Record<string, unknown>>;
}

export interface FounderContentProviderLifecycleEvidence {
  operation: FounderContentLifecycleOperation;
  provider: string;
  platform: FirstPartySocialPlatform;
  observedAt: string;
  outcome: 'accepted' | 'rejected' | 'unknown';
  providerRequestId?: string | null;
  externalPostId?: string | null;
  permalink?: string | null;
  data?: unknown;
}

export interface FounderContentProviderLifecycleAdapter {
  provider: string;
  supportedPlatforms: readonly FirstPartySocialPlatform[];
  supportedOperations: readonly FounderContentLifecycleOperation[];
  execute(
    request: FounderContentProviderLifecycleRequest,
  ): Promise<FounderContentProviderLifecycleEvidence>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validIso(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function validHttps(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function lifecycleError(message: string): Error {
  return new Error(`FOUNDER_CONTENT_LIFECYCLE_REJECTED: ${message}`);
}

export function founderContentLifecyclePolicy(
  operation: FounderContentLifecycleOperation,
): FounderContentLifecycleOperationPolicy {
  return FOUNDER_CONTENT_LIFECYCLE_POLICY[operation];
}

export function createFounderContentLifecyclePost(
  input: CreateFounderContentLifecyclePostInput,
): FounderContentLifecyclePost {
  const postId = text(input.postId);
  const accountId = text(input.accountId);
  const contentHash = text(input.contentHash).toLowerCase();
  const scheduledAt = input.scheduledAt ? text(input.scheduledAt) : null;
  const mediaCount = input.mediaCount ?? 0;

  if (!postId) throw lifecycleError('postId is required');
  if (!accountId) throw lifecycleError('accountId is required');
  if (!/^[0-9a-f]{64}$/.test(contentHash)) {
    throw lifecycleError('contentHash must be an exact sha256 digest');
  }
  if (!Number.isInteger(mediaCount) || mediaCount < 0) {
    throw lifecycleError('mediaCount must be a non-negative integer');
  }
  if (scheduledAt && !validIso(scheduledAt)) {
    throw lifecycleError('scheduledAt must be a valid timestamp when supplied');
  }

  return {
    contract: FOUNDER_CONTENT_LIFECYCLE_CONTRACT,
    postId,
    platform: input.platform,
    accountId,
    status: 'pending_approval',
    contentHash,
    mediaCount,
    approvalId: null,
    approvalExpiresAt: null,
    scheduledAt,
    postedAt: null,
    externalPostId: null,
    permalink: null,
    retryCount: 0,
    lastError: null,
    providerWriteState: 'not_attempted',
    lastMetricsSyncAt: null,
  };
}

export function approveFounderContentPost(
  post: FounderContentLifecyclePost,
  input: FounderContentApprovalInput,
): FounderContentLifecyclePost {
  if (!['pending_approval', 'failed'].includes(post.status)) {
    throw lifecycleError(`post in ${post.status} state cannot be approved`);
  }
  const approvalId = text(input.approvalId);
  const expiresAt = text(input.expiresAt);
  const now = text(input.now);
  if (!approvalId) throw lifecycleError('approvalId is required');
  if (!validIso(expiresAt) || !validIso(now)) {
    throw lifecycleError('approval timestamps must be valid');
  }
  if (Date.parse(expiresAt) <= Date.parse(now)) {
    throw lifecycleError('approval is already expired');
  }

  return {
    ...post,
    approvalId,
    approvalExpiresAt: expiresAt,
    status: post.scheduledAt ? 'scheduled' : 'approved',
    lastError: null,
    providerWriteState: 'not_attempted',
  };
}

export function rejectFounderContentPost(
  post: FounderContentLifecyclePost,
  reason?: string | null,
): FounderContentLifecyclePost {
  if (['posted', 'publishing', 'outcome_unknown'].includes(post.status)) {
    throw lifecycleError(`post in ${post.status} state cannot be rejected locally`);
  }
  return {
    ...post,
    status: 'rejected',
    lastError: text(reason) || null,
  };
}

export function rescheduleFounderContentPost(
  post: FounderContentLifecyclePost,
  scheduledAt: string,
): FounderContentLifecyclePost {
  const normalized = text(scheduledAt);
  if (!validIso(normalized)) {
    throw lifecycleError('scheduledAt must be a valid timestamp');
  }
  if (!['pending_approval', 'approved', 'scheduled'].includes(post.status)) {
    throw lifecycleError(`post in ${post.status} state cannot be rescheduled`);
  }
  return {
    ...post,
    scheduledAt: normalized,
    status: post.status === 'pending_approval' ? 'pending_approval' : 'scheduled',
  };
}

export function bulkScheduleFounderContentPosts(
  posts: readonly FounderContentLifecyclePost[],
  startAt: string,
  intervalMinutes = 30,
): FounderContentLifecyclePost[] {
  const start = Date.parse(text(startAt));
  if (!Number.isFinite(start)) throw lifecycleError('startAt must be a valid timestamp');
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    throw lifecycleError('intervalMinutes must be an integer from 1 through 1440');
  }

  return posts.map((post, index) =>
    rescheduleFounderContentPost(
      post,
      new Date(start + index * intervalMinutes * 60_000).toISOString(),
    ));
}

export function retryFounderContentPost(
  post: FounderContentLifecyclePost,
): FounderContentLifecyclePost {
  if (post.status !== 'failed') {
    throw lifecycleError('only an explicitly failed post can be reset for retry');
  }
  if (!['not_attempted', 'verified_failed'].includes(post.providerWriteState)) {
    throw lifecycleError(
      'ambiguous or attempted provider writes cannot be retried without provider readback',
    );
  }

  return {
    ...post,
    status: 'pending_approval',
    approvalId: null,
    approvalExpiresAt: null,
    retryCount: post.retryCount + 1,
    lastError: null,
    providerWriteState: 'not_attempted',
  };
}

export function beginFounderContentPublishNow(
  post: FounderContentLifecyclePost,
  confirmation: FounderContentPublishConfirmation,
): FounderContentLifecyclePost {
  if (!['approved', 'scheduled'].includes(post.status)) {
    throw lifecycleError(`post in ${post.status} state cannot publish now`);
  }
  if (confirmation.confirmPublication !== true) {
    throw lifecycleError('explicit publication confirmation is required');
  }
  const now = text(confirmation.now);
  if (!validIso(now)) throw lifecycleError('publish confirmation time must be valid');
  if (!post.approvalId || text(confirmation.approvalId) !== post.approvalId) {
    throw lifecycleError('publish confirmation must match the exact current approval');
  }
  if (!post.approvalExpiresAt || Date.parse(now) >= Date.parse(post.approvalExpiresAt)) {
    throw lifecycleError('current founder approval expired before provider mutation');
  }
  if (post.providerWriteState !== 'not_attempted') {
    throw lifecycleError('provider write was already attempted for this lifecycle generation');
  }

  return {
    ...post,
    status: 'publishing',
    providerWriteState: 'attempted',
    lastError: null,
  };
}

export function finalizeFounderContentPublish(
  post: FounderContentLifecyclePost,
  readback: FounderContentPublicationReadback,
): FounderContentLifecyclePost {
  if (post.status !== 'publishing' || post.providerWriteState !== 'attempted') {
    throw lifecycleError('publication readback requires one exact attempted provider write');
  }

  if (readback.outcome === 'published') {
    const externalPostId = text(readback.externalPostId);
    const permalink = text(readback.permalink);
    const publishedAt = text(readback.publishedAt);
    if (!externalPostId || !validHttps(permalink) || !validIso(publishedAt)) {
      throw lifecycleError('published readback requires post id, HTTPS permalink, and timestamp');
    }
    return {
      ...post,
      status: 'posted',
      providerWriteState: 'verified_published',
      externalPostId,
      permalink,
      postedAt: publishedAt,
      lastError: null,
    };
  }

  if (readback.outcome === 'failed') {
    const error = text(readback.error);
    if (!error) throw lifecycleError('failed provider readback requires an error');
    return {
      ...post,
      status: 'failed',
      providerWriteState: 'verified_failed',
      lastError: error,
    };
  }

  return {
    ...post,
    status: 'outcome_unknown',
    providerWriteState: 'unknown',
    lastError: text(readback.error) || 'provider outcome is unknown; do not retry blindly',
  };
}

export function recordFounderContentMetricsSync(
  post: FounderContentLifecyclePost,
  observedAt: string,
): FounderContentLifecyclePost {
  const normalized = text(observedAt);
  if (!validIso(normalized)) {
    throw lifecycleError('metrics observation time must be valid');
  }
  return {
    ...post,
    lastMetricsSyncAt: normalized,
  };
}
