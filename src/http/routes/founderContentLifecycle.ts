import { Router } from 'express';
import {
  FIRST_PARTY_SOCIAL_PLATFORMS,
  type FirstPartySocialPlatform,
} from '../../lib/firstPartySocialPublisher.js';
import {
  FOUNDER_CONTENT_LIFECYCLE_CONTRACT,
  FOUNDER_CONTENT_LIFECYCLE_OPERATIONS,
  FOUNDER_CONTENT_LIFECYCLE_POLICY,
  rejectFounderContentPost,
  rescheduleFounderContentPost,
  retryFounderContentPost,
  type FounderContentLifecyclePost,
  type FounderContentPostStatus,
  type FounderContentProviderLifecycleAdapter,
} from '../../lib/founderContentLifecycle.js';
import {
  FOUNDER_CONTENT_LIFECYCLE_STORE_CONTRACT,
  bulkScheduleStoredFounderContentPosts,
  createStoredFounderContentDraft,
  getStoredFounderContentPost,
  listStoredFounderContentPostEvents,
  listStoredFounderContentPosts,
  mutateStoredFounderContentPost,
  recordStoredFounderContentPostEvent,
  type StoredFounderContentPost,
} from '../../lib/founderContentLifecycleStore.js';
import {
  FOUNDER_CONTENT_PUBLICATION_SYNC_CONTRACT,
  syncStoredFounderContentPublicationResult,
} from '../../lib/founderContentPublicationSync.js';
import {
  readCurrentFounderContentApproval,
} from '../../lib/founderContentApprovalStore.js';
import {
  dispatchAuthoritativeFounderContentPublishNow,
} from '../../lib/authoritativeFounderContentPublisher.js';
import type { FounderRequest } from '../middleware/requireFounder.js';

type JsonRecord = Record<string, unknown>;

type LifecycleDependencies = {
  createDraft: typeof createStoredFounderContentDraft;
  getPost: typeof getStoredFounderContentPost;
  listPosts: typeof listStoredFounderContentPosts;
  listEvents: typeof listStoredFounderContentPostEvents;
  recordEvent: typeof recordStoredFounderContentPostEvent;
  mutatePost: typeof mutateStoredFounderContentPost;
  bulkSchedule: typeof bulkScheduleStoredFounderContentPosts;
  readApproval: typeof readCurrentFounderContentApproval;
  publishNow: typeof dispatchAuthoritativeFounderContentPublishNow;
  syncPublication: typeof syncStoredFounderContentPublicationResult;
  providerAdapters: Readonly<Record<string, FounderContentProviderLifecycleAdapter>>;
};

const DEFAULT_DEPENDENCIES: LifecycleDependencies = {
  createDraft: createStoredFounderContentDraft,
  getPost: getStoredFounderContentPost,
  listPosts: listStoredFounderContentPosts,
  listEvents: listStoredFounderContentPostEvents,
  recordEvent: recordStoredFounderContentPostEvent,
  mutatePost: mutateStoredFounderContentPost,
  bulkSchedule: bulkScheduleStoredFounderContentPosts,
  readApproval: readCurrentFounderContentApproval,
  publishNow: dispatchAuthoritativeFounderContentPublishNow,
  syncPublication: syncStoredFounderContentPublicationResult,
  providerAdapters: Object.freeze({}),
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function platform(value: unknown): FirstPartySocialPlatform | null {
  const candidate = text(value).toLowerCase() as FirstPartySocialPlatform;
  return FIRST_PARTY_SOCIAL_PLATFORMS.includes(candidate) ? candidate : null;
}

function postStatus(value: unknown): FounderContentPostStatus | null {
  const candidate = text(value) as FounderContentPostStatus;
  return [
    'pending_approval', 'approved', 'scheduled', 'publishing',
    'posted', 'rejected', 'failed', 'outcome_unknown',
  ].includes(candidate) ? candidate : null;
}

function confirmation(value: unknown) {
  const candidate = record(value);
  const truthContextHash = text(candidate.truth_context_hash);
  return {
    confirm_publication: candidate.confirm_publication === true,
    authorization_hash: text(candidate.authorization_hash),
    public_payload_hash: text(candidate.public_payload_hash),
    ...(truthContextHash ? { truth_context_hash: truthContextHash } : {}),
  };
}

function founder(req: FounderRequest) {
  return req.founder ?? null;
}

function asLifecycle(post: StoredFounderContentPost): FounderContentLifecyclePost {
  return {
    contract: FOUNDER_CONTENT_LIFECYCLE_CONTRACT,
    postId: post.postId,
    platform: post.platform,
    accountId: post.accountId,
    status: post.status,
    contentHash: post.contentHash,
    mediaCount: post.mediaCount,
    approvalId: post.approvalId,
    approvalExpiresAt: null,
    scheduledAt: post.scheduledAt,
    postedAt: post.postedAt,
    externalPostId: post.externalPostId,
    permalink: post.permalink,
    retryCount: post.retryCount,
    lastError: post.lastError,
    providerWriteState: post.providerWriteState,
    lastMetricsSyncAt: post.lastMetricsSyncAt,
  };
}

function lifecycleError(res: Parameters<Parameters<Router['get']>[1]>[1], error: unknown) {
  const message = error instanceof Error ? error.message : 'founder-content lifecycle operation failed';
  const unavailable = /does not exist|schema cache|function .* not found|relation .* not found/i.test(message);
  return res.status(unavailable ? 503 : 409).json({
    ok: false,
    code: unavailable ? 'FOUNDER_CONTENT_LIFECYCLE_STORE_NOT_APPLIED' : 'FOUNDER_CONTENT_LIFECYCLE_REJECTED',
    contract: FOUNDER_CONTENT_LIFECYCLE_CONTRACT,
    reason: message,
  });
}

function adapter(
  deps: LifecycleDependencies,
  provider: string,
  operation: (typeof FOUNDER_CONTENT_LIFECYCLE_OPERATIONS)[number],
  requestedPlatform?: FirstPartySocialPlatform | null,
) {
  const resolved = deps.providerAdapters[provider];
  if (!resolved) return null;
  if (!resolved.supportedOperations.includes(operation)) return null;
  if (requestedPlatform && !resolved.supportedPlatforms.includes(requestedPlatform)) return null;
  return resolved;
}

async function requireStoredPost(
  deps: LifecycleDependencies,
  req: FounderRequest,
  res: Parameters<Parameters<Router['get']>[1]>[1],
): Promise<StoredFounderContentPost | null> {
  const identity = founder(req);
  if (!identity) {
    res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    return null;
  }
  const post = await deps.getPost(identity.userId, text(req.params.postId));
  if (!post) {
    res.status(404).json({ ok: false, code: 'FOUNDER_CONTENT_POST_NOT_FOUND' });
    return null;
  }
  return post;
}

export function createFounderContentLifecycleRouter(
  overrides: Partial<LifecycleDependencies> = {},
) {
  const deps: LifecycleDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...overrides,
    providerAdapters: overrides.providerAdapters ?? DEFAULT_DEPENDENCIES.providerAdapters,
  };
  const router = Router();

  router.get('/', (_req: FounderRequest, res) => res.json({
    contract: FOUNDER_CONTENT_LIFECYCLE_CONTRACT,
    storeContract: FOUNDER_CONTENT_LIFECYCLE_STORE_CONTRACT,
    publicationSyncContract: FOUNDER_CONTENT_PUBLICATION_SYNC_CONTRACT,
    operations: FOUNDER_CONTENT_LIFECYCLE_OPERATIONS.map((operation) => ({
      operation,
      ...FOUNDER_CONTENT_LIFECYCLE_POLICY[operation],
    })),
    platforms: FIRST_PARTY_SOCIAL_PLATFORMS,
    providerAdapters: Object.values(deps.providerAdapters).map((item) => ({
      provider: item.provider,
      supportedPlatforms: item.supportedPlatforms,
      supportedOperations: item.supportedOperations,
    })),
    authority: {
      editorialState: 'fcr-lifecycle-ledger',
      approval: 'founder_content_approvals',
      cadence: 'founder_content_cadence_reservations',
      providerExecution: 'approval_executions',
      providerCredentials: 'provider-adapter-owned',
      providerReadbackRequired: true,
      callerMetricsAreProviderEvidence: false,
      blindRetryAllowed: false,
    },
  }));

  router.post('/posts', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    const body = record(req.body);
    const requestedPlatform = platform(body.platform);
    if (!requestedPlatform) {
      return res.status(400).json({ ok: false, code: 'UNSUPPORTED_PLATFORM', platforms: FIRST_PARTY_SOCIAL_PLATFORMS });
    }
    try {
      const post = await deps.createDraft({
        founderUserId: identity.userId,
        provider: text(body.provider),
        platform: requestedPlatform,
        accountId: text(body.account_id),
        title: text(body.title),
        publicPayload: record(body.public_payload),
        mediaCount: integer(body.media_count, 0),
        scheduledAt: text(body.scheduled_at) || null,
        actor: identity.email,
      });
      return res.status(201).json({ ok: true, post, published: false });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.get('/posts', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    const requestedStatus = text(req.query.status) ? postStatus(req.query.status) : null;
    const requestedPlatform = text(req.query.platform) ? platform(req.query.platform) : null;
    if (text(req.query.status) && !requestedStatus) return res.status(400).json({ ok: false, code: 'INVALID_STATUS_FILTER' });
    if (text(req.query.platform) && !requestedPlatform) return res.status(400).json({ ok: false, code: 'INVALID_PLATFORM_FILTER' });
    try {
      const posts = await deps.listPosts({
        founderUserId: identity.userId,
        status: requestedStatus,
        platform: requestedPlatform,
        limit: integer(req.query.limit, 50),
      });
      return res.json({ ok: true, posts });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.get('/posts/:postId', async (req: FounderRequest, res) => {
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      return res.json({ ok: true, post });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.get('/posts/:postId/logs', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const events = await deps.listEvents(identity.userId, post.postId);
      return res.json({ ok: true, postId: post.postId, logs: events });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.get('/posts/:postId/comments', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const comments = await deps.listEvents(identity.userId, post.postId, 'review_comment');
      return res.json({ ok: true, postId: post.postId, comments });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/:postId/comments', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    const message = text(record(req.body).message);
    if (!message || message.length > 2000) {
      return res.status(400).json({ ok: false, code: 'INVALID_REVIEW_COMMENT' });
    }
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const comment = await deps.recordEvent({
        founderUserId: identity.userId,
        postId: post.postId,
        eventType: 'review_comment',
        actor: identity.email,
        payload: { message },
      });
      return res.status(201).json({ ok: true, comment, published: false });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/:postId/approve', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    const body = record(req.body);
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      if (!['pending_approval', 'failed'].includes(post.status)) {
        if (['approved', 'scheduled'].includes(post.status) && post.approvalId === text(body.approval_id)) {
          return res.json({ ok: true, post, idempotent: true, published: false });
        }
        return res.status(409).json({ ok: false, code: 'POST_NOT_APPROVABLE', status: post.status });
      }
      const approval = await deps.readApproval({
        proposal: record(body.proposal),
        founderUserId: identity.userId,
        approvalId: text(body.approval_id),
        authorizationHash: text(body.authorization_hash),
        expectedPublicPayloadHash: post.contentHash,
      });
      if (!approval.ok) {
        return res.status(409).json({ ok: false, code: approval.code, reason: approval.reason, published: false });
      }
      const nextStatus: FounderContentPostStatus = post.scheduledAt ? 'scheduled' : 'approved';
      const updated = await deps.mutatePost({
        founderUserId: identity.userId,
        postId: post.postId,
        expectedStatus: post.status,
        expectedProviderWriteState: post.providerWriteState,
        nextStatus,
        nextProviderWriteState: 'not_attempted',
        patch: {
          approval_id: approval.approvalId,
          execution_id: null,
          last_error: null,
        },
        eventType: 'approval_bound',
        actor: identity.email,
        eventPayload: {
          approval_id: approval.approvalId,
          public_payload_hash: approval.publicPayloadHash,
          authority: 'reference_to_unconsumed_one_shot_approval',
          published: false,
        },
      });
      return res.json({ ok: true, post: updated, published: false });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/:postId/reject', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const next = rejectFounderContentPost(asLifecycle(post), text(record(req.body).reason));
      const updated = await deps.mutatePost({
        founderUserId: identity.userId,
        postId: post.postId,
        expectedStatus: post.status,
        expectedProviderWriteState: post.providerWriteState,
        nextStatus: next.status,
        nextProviderWriteState: next.providerWriteState,
        patch: { last_error: next.lastError },
        eventType: 'post_rejected',
        actor: identity.email,
        eventPayload: { reason: next.lastError, provider_write_attempted: post.providerWriteState !== 'not_attempted' },
      });
      return res.json({ ok: true, post: updated, published: false });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/:postId/reschedule', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    const scheduledAt = text(record(req.body).scheduled_at);
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const next = rescheduleFounderContentPost(asLifecycle(post), scheduledAt);
      const updated = await deps.mutatePost({
        founderUserId: identity.userId,
        postId: post.postId,
        expectedStatus: post.status,
        expectedProviderWriteState: post.providerWriteState,
        nextStatus: next.status,
        nextProviderWriteState: next.providerWriteState,
        patch: { scheduled_at: next.scheduledAt },
        eventType: 'schedule_intent_set',
        actor: identity.email,
        eventPayload: {
          scheduled_at: next.scheduledAt,
          authority: 'editorial_intent_only',
          provider_write_attempted: false,
        },
      });
      return res.json({
        ok: true,
        post: updated,
        providerScheduled: false,
        nextGate: 'Provider scheduling still requires cadence + execution authority.',
      });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/bulk-schedule', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    const body = record(req.body);
    const postIds = Array.isArray(body.post_ids) ? body.post_ids.map(text) : [];
    try {
      const posts = await deps.bulkSchedule({
        founderUserId: identity.userId,
        postIds,
        startAt: text(body.start_at),
        intervalMinutes: integer(body.interval_minutes, 30),
        actor: identity.email,
      });
      return res.json({
        ok: true,
        posts,
        providerScheduled: false,
        authority: 'editorial_schedule_intent_only',
      });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/:postId/retry', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const next = retryFounderContentPost(asLifecycle(post));
      const updated = await deps.mutatePost({
        founderUserId: identity.userId,
        postId: post.postId,
        expectedStatus: post.status,
        expectedProviderWriteState: post.providerWriteState,
        nextStatus: next.status,
        nextProviderWriteState: next.providerWriteState,
        patch: {
          approval_id: null,
          execution_id: null,
          retry_count: next.retryCount,
          last_error: null,
        },
        eventType: 'retry_reset',
        actor: identity.email,
        eventPayload: {
          prior_execution_id: post.executionId,
          fresh_approval_required: true,
          provider_write_attempted: false,
        },
      });
      return res.json({ ok: true, post: updated, providerWriteExecuted: false });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.get('/posts/:postId/status', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const providerAdapter = adapter(deps, post.provider, 'get_post_status', post.platform);
      if (!providerAdapter) {
        return res.json({
          ok: true,
          post,
          providerReadback: {
            available: false,
            truthState: 'UNKNOWN',
            reason: 'No current provider lifecycle adapter can read external post status.',
          },
        });
      }
      const evidence = await providerAdapter.execute({
        operation: 'get_post_status',
        platform: post.platform,
        postId: post.postId,
        accountId: post.accountId,
        payload: { externalPostId: post.externalPostId },
      });
      await deps.recordEvent({
        founderUserId: identity.userId,
        postId: post.postId,
        eventType: 'provider_status_readback',
        actor: `provider:${providerAdapter.provider}`,
        payload: { ...record(evidence.data), outcome: evidence.outcome, observed_at: evidence.observedAt },
        observedAt: evidence.observedAt,
      });
      return res.json({ ok: true, post, providerReadback: { available: true, evidence } });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.get('/accounts', async (req: FounderRequest, res) => {
    const provider = text(req.query.provider).toLowerCase();
    const requestedPlatform = platform(req.query.platform);
    if (!provider || !requestedPlatform) {
      return res.status(400).json({ ok: false, code: 'PROVIDER_AND_PLATFORM_REQUIRED' });
    }
    const providerAdapter = adapter(deps, provider, 'list_accounts', requestedPlatform);
    if (!providerAdapter) {
      return res.status(409).json({
        ok: false,
        code: 'PROVIDER_ACCOUNT_ADAPTER_NOT_READY',
        provider,
        platform: requestedPlatform,
        accounts: [],
      });
    }
    try {
      const evidence = await providerAdapter.execute({
        operation: 'list_accounts',
        platform: requestedPlatform,
        payload: {},
      });
      return res.json({ ok: evidence.outcome === 'accepted', evidence });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/accounts/connect', async (req: FounderRequest, res) => {
    const body = record(req.body);
    const provider = text(body.provider).toLowerCase();
    const requestedPlatform = platform(body.platform);
    if (!provider || !requestedPlatform) {
      return res.status(400).json({ ok: false, code: 'PROVIDER_AND_PLATFORM_REQUIRED' });
    }
    const providerAdapter = adapter(deps, provider, 'connect_account', requestedPlatform);
    if (!providerAdapter) {
      return res.status(409).json({
        ok: false,
        code: 'PROVIDER_CONNECT_ADAPTER_NOT_READY',
        provider,
        platform: requestedPlatform,
        externalMutation: false,
      });
    }
    try {
      const evidence = await providerAdapter.execute({
        operation: 'connect_account',
        platform: requestedPlatform,
        payload: { accountName: text(body.account_name) || null },
      });
      return res.status(evidence.outcome === 'accepted' ? 200 : 409).json({
        ok: evidence.outcome === 'accepted',
        evidence,
        publicationAuthorityGranted: false,
      });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/:postId/publish-now', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    const body = record(req.body);
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      if (post.platform !== 'linkedin' || post.provider !== 'linkedin') {
        return res.status(409).json({
          ok: false,
          code: 'PROVIDER_PUBLISH_NOW_ADAPTER_NOT_READY',
          provider: post.provider,
          platform: post.platform,
          published: false,
          reason: 'Current direct authoritative publish-now implementation is LinkedIn-only; other providers remain adapter-gated.',
        });
      }
      if (!['approved', 'scheduled'].includes(post.status)) {
        return res.status(409).json({ ok: false, code: 'POST_NOT_PUBLISHABLE', status: post.status, published: false });
      }
      if (!post.approvalId || post.approvalId !== text(body.approval_id).toLowerCase()) {
        return res.status(409).json({ ok: false, code: 'POST_APPROVAL_MISMATCH', published: false });
      }
      const exactConfirmation = confirmation(body.confirmation);
      if (exactConfirmation.public_payload_hash.toLowerCase() !== post.contentHash) {
        return res.status(409).json({ ok: false, code: 'POST_COPY_HASH_MISMATCH', published: false });
      }

      const result = await deps.publishNow({
        proposal: record(body.proposal),
        approval_id: post.approvalId,
        confirmation: exactConfirmation,
      }, {
        founderUserId: identity.userId,
        founderIdentity: identity.email,
      });

      let lifecyclePost: StoredFounderContentPost | null = post;
      let lifecycleSync: 'not-required' | 'synced' | 'failed' = 'not-required';
      let lifecycleSyncReason: string | null = null;

      if (result.truthState === 'BLOCKED' || !result.executionId) {
        await deps.recordEvent({
          founderUserId: identity.userId,
          postId: post.postId,
          eventType: 'publication_blocked',
          actor: identity.email,
          payload: {
            code: result.code,
            reasons: result.reasons,
            published: result.published,
            provider_write_attempted: false,
          },
        });
      } else {
        try {
          lifecyclePost = await deps.syncPublication({
            founderUserId: identity.userId,
            postId: post.postId,
            result,
            actor: identity.email,
          });
          lifecycleSync = 'synced';
        } catch (syncError) {
          lifecycleSync = 'failed';
          lifecycleSyncReason = syncError instanceof Error ? syncError.message : 'lifecycle sync failed';
        }
      }

      return res.status(result.status).json({
        ...result,
        lifecyclePost,
        lifecycleSync,
        lifecycleSyncReason,
        doNotRetryBecauseLifecycleSyncFailed: result.published === true,
      });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.post('/posts/:postId/sync-metrics', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    try {
      const post = await requireStoredPost(deps, req, res);
      if (!post) return;
      const providerAdapter = adapter(deps, post.provider, 'sync_post_metrics', post.platform);
      if (!providerAdapter) {
        return res.status(409).json({
          ok: false,
          code: 'PROVIDER_METRICS_ADAPTER_NOT_READY',
          provider: post.provider,
          platform: post.platform,
          metricsAcceptedFromCaller: false,
        });
      }
      const evidence = await providerAdapter.execute({
        operation: 'sync_post_metrics',
        platform: post.platform,
        postId: post.postId,
        accountId: post.accountId,
        payload: { externalPostId: post.externalPostId },
      });
      if (evidence.outcome !== 'accepted') {
        await deps.recordEvent({
          founderUserId: identity.userId,
          postId: post.postId,
          eventType: 'metrics_sync_readback',
          actor: `provider:${providerAdapter.provider}`,
          payload: { outcome: evidence.outcome, data: record(evidence.data) },
          observedAt: evidence.observedAt,
        });
        return res.status(evidence.outcome === 'unknown' ? 202 : 409).json({ ok: false, evidence });
      }
      const updated = await deps.mutatePost({
        founderUserId: identity.userId,
        postId: post.postId,
        expectedStatus: post.status,
        expectedProviderWriteState: post.providerWriteState,
        nextStatus: post.status,
        nextProviderWriteState: post.providerWriteState,
        patch: { last_metrics_sync_at: evidence.observedAt },
        eventType: 'metrics_synced',
        actor: `provider:${providerAdapter.provider}`,
        eventPayload: { data: record(evidence.data), outcome: evidence.outcome },
        now: evidence.observedAt,
      });
      return res.json({ ok: true, post: updated, evidence });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  router.get('/analytics', async (req: FounderRequest, res) => {
    const identity = founder(req);
    if (!identity) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    try {
      const posts = await deps.listPosts({ founderUserId: identity.userId, limit: Math.min(integer(req.query.limit, 100), 200) });
      const byStatus = Object.fromEntries(
        ['pending_approval', 'approved', 'scheduled', 'publishing', 'posted', 'rejected', 'failed', 'outcome_unknown']
          .map((key) => [key, posts.filter((post) => post.status === key).length]),
      );
      const byPlatform = Object.fromEntries(
        FIRST_PARTY_SOCIAL_PLATFORMS.map((key) => [key, posts.filter((post) => post.platform === key).length]),
      );
      const retryQueue = posts
        .filter((post) => post.status === 'failed' && ['not_attempted', 'verified_failed'].includes(post.providerWriteState))
        .map((post) => ({ postId: post.postId, platform: post.platform, provider: post.provider, lastError: post.lastError }));
      const ambiguous = posts
        .filter((post) => post.status === 'outcome_unknown')
        .map((post) => ({ postId: post.postId, platform: post.platform, provider: post.provider, executionId: post.executionId }));
      const metrics = posts
        .filter((post) => post.lastMetricsSyncAt)
        .map((post) => ({ postId: post.postId, platform: post.platform, lastMetricsSyncAt: post.lastMetricsSyncAt }));
      return res.json({
        ok: true,
        scope: 'authenticated-founder',
        totalPosts: posts.length,
        byStatus,
        byPlatform,
        failureCount: (byStatus.failed ?? 0) + (byStatus.outcome_unknown ?? 0),
        retryQueue,
        ambiguousProviderOutcomes: ambiguous,
        availablePlatformMetricSnapshots: metrics,
        callerSuppliedMetricsAccepted: false,
      });
    } catch (error) {
      return lifecycleError(res, error);
    }
  });

  return router;
}

export const founderContentLifecycleRouter = createFounderContentLifecycleRouter();
