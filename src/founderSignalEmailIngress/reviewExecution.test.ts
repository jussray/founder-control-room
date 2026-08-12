import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FounderSignalReviewEmailReceipt } from './receipt.js';
import {
  buildFounderSignalReviewToken,
  processFounderSignalReviewCommand,
  validateFounderSignalReviewContextRegistration,
  type FounderSignalReviewContext,
  type FounderSignalReviewContextRepository,
  type FounderSignalReviewDispatchRecord,
  type FounderSignalReviewDispatchRepository,
} from './reviewExecution.js';

const replyContextId = '45bb874d-69d4-4b32-8df2-c7934bb888c5';
const batchId = '84dc889e-8e72-4f25-a4ae-5a66e86af220';
const founderSender = 'founder@example.com';
const replyToAddress = `review+${replyContextId}@foundercontrolroom.org`;
const reviewDeadline = '2026-08-12T01:00:00.000Z';
const scheduledPosts = [
  {
    channel: 'linkedin',
    bufferPostId: 'buffer-linkedin-1',
    validatedPostText: 'Exact-head proof shipped. https://example.com/proof',
    scheduledAt: reviewDeadline,
  },
  {
    channel: 'x',
    bufferPostId: 'buffer-x-1',
    validatedPostText: 'Proof shipped: https://example.com/proof',
    scheduledAt: reviewDeadline,
  },
];

const registration = {
  version: 1 as const,
  sourceRepo: 'jussray/founder-control-room',
  sourceCommitSha: 'a'.repeat(40),
  batchId,
  replyContextId,
  founderSender,
  replyToAddress,
  reviewDeadline,
  reviewToken: buildFounderSignalReviewToken({
    batchId,
    replyContextId,
    replyToAddress,
    scheduledPosts,
  }),
  scheduledPosts,
};

const context = validateFounderSignalReviewContextRegistration(registration);

const baseReceipt: FounderSignalReviewEmailReceipt = {
  version: 1,
  ingressId: 'ae4a3de8-c98c-52d0-af3a-8a4733c9142e',
  replyContextId,
  messageRefHash: '1'.repeat(64),
  rawMessageHash: '2'.repeat(64),
  senderRefHash: createHash('sha256').update(founderSender).digest('hex'),
  recipientRefHash: createHash('sha256').update(replyToAddress).digest('hex'),
  commandHash: '3'.repeat(64),
  commandType: 'cancel_one',
  targetChannel: 'linkedin',
  commandText: 'linkedin: cancel',
  senderAddressMatched: true,
  authorizationState: 'intake_only_unresolved',
  executionAllowed: false,
  providerActionsRequested: 0,
  receivedAt: '2026-08-12T00:50:00.000Z',
  source: 'cloudflare_email_routing',
};

function contextRepository(value: FounderSignalReviewContext | null = context): FounderSignalReviewContextRepository {
  return {
    find: vi.fn().mockResolvedValue(value),
    store: vi.fn().mockResolvedValue('stored'),
  };
}

function dispatchRepository(existing: FounderSignalReviewDispatchRecord | null = null): FounderSignalReviewDispatchRepository {
  let record = existing;
  return {
    reserve: vi.fn(async (candidate) => {
      if (!record) {
        record = candidate;
        return 'reserved';
      }
      return 'existing';
    }),
    find: vi.fn(async () => record),
    recordAttempt: vi.fn(async (ingressId, state, providerHttpStatus, providerResponseHash) => {
      if (!record) throw new Error('missing');
      record = {
        ...record,
        ingressId,
        state,
        providerHttpStatus,
        providerResponseHash,
        attempts: record.attempts + 1,
      };
      return record;
    }),
  };
}

describe('Founder Signal review execution bridge', () => {
  const originalHook = process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHook === undefined) delete process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL;
    else process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL = originalHook;
  });

  it('normalizes a context only when the deterministic review token matches', () => {
    expect(context).toMatchObject({
      sourceRepo: 'jussray/founder-control-room',
      sourceCommitSha: 'a'.repeat(40),
      batchId,
      replyContextId,
      reviewDeadline,
    });
    expect(context.founderSenderRefHash).toMatch(/^[0-9a-f]{64}$/);
    expect(context.replyToRefHash).toMatch(/^[0-9a-f]{64}$/);
    expect(context.reviewTokenHash).toMatch(/^[0-9a-f]{64}$/);

    expect(() => validateFounderSignalReviewContextRegistration({
      ...registration,
      reviewToken: 'f'.repeat(64),
    })).toThrowError(/review_token_mismatch/);
  });

  it('blocks commands when no exact private review context exists', async () => {
    const result = await processFounderSignalReviewCommand(baseReceipt, {
      contextRepository: contextRepository(null),
      dispatchRepository: dispatchRepository(),
      now: () => Date.parse('2026-08-12T00:51:00.000Z'),
      fetchImpl: vi.fn(),
    });

    expect(result).toEqual({
      authorizationState: 'blocked_context_missing',
      executionAllowed: false,
      providerDispatchAccepted: false,
      providerExecutionProven: false,
      providerActionsRequested: 0,
      idempotencyKey: null,
    });
  });

  it('dispatches one exact cancel operation and never calls that provider 2xx execution proof', async () => {
    process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL = 'https://hooks.example.test/founder-signal';
    const repository = dispatchRepository();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"accepted":true}', { status: 200 }),
    );

    const result = await processFounderSignalReviewCommand(baseReceipt, {
      contextRepository: contextRepository(),
      dispatchRepository: repository,
      now: () => Date.parse('2026-08-12T00:51:00.000Z'),
      fetchImpl,
    });

    expect(result).toMatchObject({
      authorizationState: 'context_authorized',
      executionAllowed: true,
      providerDispatchAccepted: true,
      providerExecutionProven: false,
      providerActionsRequested: 1,
      idempotencyKey: `founder-review:${baseReceipt.ingressId}`,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      event_type: 'founder_review_command',
      source_repo: context.sourceRepo,
      source_commit_sha: context.sourceCommitSha,
      batch_id: batchId,
      reply_context_id: replyContextId,
      ingress_id: baseReceipt.ingressId,
      command_type: 'cancel_one',
      target_channel: 'linkedin',
      provider_execution_receipt_required: true,
      operations: [{
        buffer_action: 'buffer_cancel_scheduled_post',
        buffer_post_id: 'buffer-linkedin-1',
        channel: 'linkedin',
      }],
    });
    expect(JSON.stringify(payload)).not.toContain(founderSender);
    expect(JSON.stringify(payload)).not.toContain(replyToAddress);
  });

  it('does not redispatch an ingress whose provider hook acceptance is already recorded', async () => {
    process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL = 'https://hooks.example.test/founder-signal';
    const request = {
      version: 1,
      event_type: 'founder_review_command',
      idempotency_key: `founder-review:${baseReceipt.ingressId}`,
      source_repo: context.sourceRepo,
      source_commit_sha: context.sourceCommitSha,
      batch_id: context.batchId,
      reply_context_id: context.replyContextId,
      ingress_id: baseReceipt.ingressId,
      command_type: baseReceipt.commandType,
      target_channel: baseReceipt.targetChannel,
      command_hash: baseReceipt.commandHash,
      received_at: baseReceipt.receivedAt,
      review_deadline: context.reviewDeadline,
      operations: [{
        buffer_action: 'buffer_cancel_scheduled_post',
        buffer_post_id: 'buffer-linkedin-1',
        channel: 'linkedin',
      }],
      provider_execution_receipt_required: true,
    };
    const existing: FounderSignalReviewDispatchRecord = {
      ingressId: baseReceipt.ingressId,
      replyContextId,
      idempotencyKey: `founder-review:${baseReceipt.ingressId}`,
      providerRequestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
      providerActionsRequested: 1,
      state: 'accepted',
      providerHttpStatus: 200,
      providerResponseHash: '4'.repeat(64),
      attempts: 1,
    };
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await processFounderSignalReviewCommand(baseReceipt, {
      contextRepository: contextRepository(),
      dispatchRepository: dispatchRepository(existing),
      now: () => Date.parse('2026-08-12T00:51:00.000Z'),
      fetchImpl,
    });

    expect(result.providerDispatchAccepted).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed after the review deadline or on sender/recipient context mismatch', async () => {
    const late = await processFounderSignalReviewCommand(baseReceipt, {
      contextRepository: contextRepository(),
      dispatchRepository: dispatchRepository(),
      now: () => Date.parse(reviewDeadline),
      fetchImpl: vi.fn(),
    });
    expect(late.authorizationState).toBe('blocked_deadline_elapsed');

    const mismatch = await processFounderSignalReviewCommand({
      ...baseReceipt,
      recipientRefHash: 'f'.repeat(64),
    }, {
      contextRepository: contextRepository(),
      dispatchRepository: dispatchRepository(),
      now: () => Date.parse('2026-08-12T00:51:00.000Z'),
      fetchImpl: vi.fn(),
    });
    expect(mismatch.authorizationState).toBe('blocked_context_mismatch');
  });
});
