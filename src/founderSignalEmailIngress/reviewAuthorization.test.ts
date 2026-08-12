import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FounderSignalReviewEmailReceipt } from './receipt.js';
import { processFounderSignalReviewCommandWithCapability } from './reviewAuthorization.js';
import {
  buildFounderSignalReviewToken,
  validateFounderSignalReviewContextRegistration,
  type FounderSignalReviewContextRepository,
  type FounderSignalReviewDispatchRecord,
  type FounderSignalReviewDispatchRepository,
} from './reviewExecution.js';

const replyContextId = '45bb874d-69d4-4b32-8df2-c7934bb888c5';
const batchId = '84dc889e-8e72-4f25-a4ae-5a66e86af220';
const founderSender = 'founder@example.com';
const replyToAddress = `review+${replyContextId}@foundercontrolroom.org`;
const reviewDeadline = '2026-08-12T01:00:00.000Z';
const scheduledPosts = [{
  channel: 'linkedin',
  bufferPostId: 'buffer-linkedin-1',
  validatedPostText: 'Exact-head proof shipped. https://example.com/proof',
  scheduledAt: reviewDeadline,
}];
const reviewToken = buildFounderSignalReviewToken({
  batchId,
  replyContextId,
  replyToAddress,
  scheduledPosts,
});
const context = validateFounderSignalReviewContextRegistration({
  version: 1,
  sourceRepo: 'jussray/founder-control-room',
  sourceCommitSha: 'a'.repeat(40),
  batchId,
  replyContextId,
  founderSender,
  replyToAddress,
  reviewDeadline,
  reviewToken,
  scheduledPosts,
});
const validReviewTokenHash = createHash('sha256').update(reviewToken).digest('hex');

function receipt(reviewTokenHash = validReviewTokenHash): FounderSignalReviewEmailReceipt {
  return {
    version: 1,
    ingressId: 'ae4a3de8-c98c-52d0-af3a-8a4733c9142e',
    replyContextId,
    messageRefHash: '1'.repeat(64),
    rawMessageHash: '2'.repeat(64),
    senderRefHash: createHash('sha256').update(founderSender).digest('hex'),
    recipientRefHash: createHash('sha256').update(replyToAddress).digest('hex'),
    reviewTokenHash,
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
}

function contextRepository(found = context): FounderSignalReviewContextRepository {
  return {
    find: vi.fn().mockResolvedValue(found),
    store: vi.fn().mockResolvedValue('stored'),
  };
}

function dispatchRepository(): FounderSignalReviewDispatchRepository {
  let record: FounderSignalReviewDispatchRecord | null = null;
  return {
    reserve: vi.fn(async candidate => {
      record = candidate;
      return 'reserved' as const;
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

describe('Founder review capability authorization', () => {
  const originalHook = process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHook === undefined) delete process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL;
    else process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL = originalHook;
  });

  it('blocks a missing context before provider dispatch', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await processFounderSignalReviewCommandWithCapability(receipt(), {
      contextRepository: contextRepository(null as never),
      dispatchRepository: dispatchRepository(),
      fetchImpl,
      now: () => Date.parse('2026-08-12T00:51:00.000Z'),
    });

    expect(result.authorizationState).toBe('blocked_context_missing');
    expect(result.executionAllowed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks a forged review-token hash even when sender, recipient, UUID, and deadline match', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await processFounderSignalReviewCommandWithCapability(receipt('f'.repeat(64)), {
      contextRepository: contextRepository(),
      dispatchRepository: dispatchRepository(),
      fetchImpl,
      now: () => Date.parse('2026-08-12T00:51:00.000Z'),
    });

    expect(result).toEqual({
      authorizationState: 'blocked_context_mismatch',
      executionAllowed: false,
      providerDispatchAccepted: false,
      providerExecutionProven: false,
      providerActionsRequested: 0,
      idempotencyKey: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('permits the existing bounded processor only after exact capability proof', async () => {
    process.env.ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL = 'https://hooks.example.test/founder-signal';
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"accepted":true}', { status: 200 }),
    );
    const result = await processFounderSignalReviewCommandWithCapability(receipt(), {
      contextRepository: contextRepository(),
      dispatchRepository: dispatchRepository(),
      fetchImpl,
      now: () => Date.parse('2026-08-12T00:51:00.000Z'),
    });

    expect(result).toMatchObject({
      authorizationState: 'context_authorized',
      executionAllowed: true,
      providerDispatchAccepted: true,
      providerExecutionProven: false,
      providerActionsRequested: 1,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
