import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFounderSignalReviewToken,
  type FounderSignalReviewContextRepository,
} from '../../../founderSignalEmailIngress/reviewExecution.js';
import { createFounderSignalReviewContextIngestHandler } from '../founderSignalReviewContexts.js';
import { deriveProofOfShipReceiptToken } from '../proofOfShipReceipts.js';

const MCP_TOKEN = 'founder-signal-engine-context-test-token';
const replyContextId = '45bb874d-69d4-4b32-8df2-c7934bb888c5';
const batchId = '84dc889e-8e72-4f25-a4ae-5a66e86af220';
const replyToAddress = `review+${replyContextId}@foundercontrolroom.org`;
const reviewDeadline = '2026-08-12T01:00:00.000Z';
const scheduledPosts = [{
  channel: 'linkedin',
  bufferPostId: 'buffer-linkedin-1',
  validatedPostText: 'Exact proof: https://example.com/proof',
  scheduledAt: reviewDeadline,
}];
const reviewToken = buildFounderSignalReviewToken({
  batchId,
  replyContextId,
  replyToAddress,
  scheduledPosts,
});
const validContext = {
  version: 1,
  sourceRepo: 'jussray/founder-control-room',
  sourceCommitSha: 'a'.repeat(40),
  batchId,
  replyContextId,
  founderSender: 'founder@example.com',
  replyToAddress,
  reviewDeadline,
  reviewToken,
  scheduledPosts,
};

function createApp(repository: FounderSignalReviewContextRepository) {
  const app = express();
  app.post(
    '/ingest/founder-review-contexts',
    express.json({ type: 'application/json', limit: '32kb' }),
    createFounderSignalReviewContextIngestHandler(repository),
  );
  return app;
}

describe('Founder Signal review context ingest', () => {
  const originalToken = process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN;

  beforeEach(() => {
    process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN = MCP_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN;
    else process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN = originalToken;
  });

  it('stores only the normalized private correlation context', async () => {
    const store = vi.fn().mockResolvedValue('stored');
    const repository: FounderSignalReviewContextRepository = {
      store,
      find: vi.fn(),
    };
    const response = await request(createApp(repository))
      .post('/ingest/founder-review-contexts')
      .set('x-proof-of-ship-receipt-token', deriveProofOfShipReceiptToken(MCP_TOKEN))
      .send(validContext);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      replyContextId,
      batchId,
      sourceRepo: validContext.sourceRepo,
      sourceCommitSha: validContext.sourceCommitSha,
      reviewDeadline,
      scheduledPostCount: 1,
    });
    expect(store).toHaveBeenCalledOnce();
    const normalized = store.mock.calls[0][0];
    expect(normalized.founderSenderRefHash).toBe(
      createHash('sha256').update('founder@example.com').digest('hex'),
    );
    expect(normalized.replyToRefHash).toBe(
      createHash('sha256').update(replyToAddress).digest('hex'),
    );
    expect(normalized).not.toHaveProperty('founderSender');
    expect(normalized).not.toHaveProperty('replyToAddress');
    expect(normalized).not.toHaveProperty('reviewToken');
  });

  it('rejects missing auth, review-token drift, and conflicting context reuse', async () => {
    const repository: FounderSignalReviewContextRepository = {
      store: vi.fn().mockResolvedValue('stored'),
      find: vi.fn(),
    };
    const missing = await request(createApp(repository))
      .post('/ingest/founder-review-contexts')
      .send(validContext);
    expect(missing.status).toBe(401);

    const invalidToken = await request(createApp(repository))
      .post('/ingest/founder-review-contexts')
      .set('x-proof-of-ship-receipt-token', deriveProofOfShipReceiptToken(MCP_TOKEN))
      .send({ ...validContext, reviewToken: 'f'.repeat(64) });
    expect(invalidToken.status).toBe(400);
    expect(invalidToken.body).toEqual({ error: 'review_token_mismatch' });

    const conflictRepository: FounderSignalReviewContextRepository = {
      store: vi.fn().mockResolvedValue('conflict'),
      find: vi.fn(),
    };
    const conflict = await request(createApp(conflictRepository))
      .post('/ingest/founder-review-contexts')
      .set('x-proof-of-ship-receipt-token', deriveProofOfShipReceiptToken(MCP_TOKEN))
      .send(validContext);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      accepted: false,
      error: 'review_context_conflict',
      replyContextId,
    });
  });
});
