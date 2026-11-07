import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFounderSignalReviewEmailIngestHandler,
  type FounderSignalReviewCommandProcessor,
  type FounderSignalReviewEmailReceiptStore,
} from '../founderSignalReviewEmailIngress.js';

const nowMs = Date.parse('2026-08-02T21:05:00.000Z');
const secret = 'test-review-email-ingress-secret-32-bytes';
const receipt = {
  version: 1,
  ingressId: 'ae4a3de8-c98c-52d0-af3a-8a4733c9142e',
  replyContextId: '45bb874d-69d4-4b32-8df2-c7934bb888c5',
  messageRefHash: 'a'.repeat(64),
  rawMessageHash: 'b'.repeat(64),
  senderRefHash: 'c'.repeat(64),
  recipientRefHash: 'd'.repeat(64),
  reviewTokenHash: 'f'.repeat(64),
  commandHash: 'e'.repeat(64),
  commandType: 'edit_one',
  targetChannel: 'juss_rayy_linkedin',
  commandText: 'juss_rayy_linkedin: make the proof line more direct',
  senderAddressMatched: true,
  authorizationState: 'intake_only_unresolved',
  executionAllowed: false,
  providerActionsRequested: 0,
  receivedAt: '2026-08-02T21:05:00.000Z',
  source: 'cloudflare_email_routing',
} as const;

function app(store: FounderSignalReviewEmailReceiptStore, processor: FounderSignalReviewCommandProcessor) {
  const instance = express();
  instance.post(
    '/ingest/founder-review-email',
    express.raw({ type: 'application/json', limit: '16kb' }),
    createFounderSignalReviewEmailIngestHandler(store, {
      now: () => nowMs,
      processor,
    }),
  );
  return instance;
}

function signedHeaders(body: string) {
  const timestamp = String(nowMs);
  const signature = createHmac('sha256', secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(body, 'utf8')
    .digest('hex');
  return { timestamp, signature };
}

describe('Founder review email replay boundary', () => {
  const originalSecret = process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;

  beforeEach(() => {
    process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = secret;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;
    else process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = originalSecret;
  });

  it('acknowledges a durable duplicate without re-entering provider command processing', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>().mockResolvedValue('duplicate');
    const processor = vi.fn<FounderSignalReviewCommandProcessor>().mockResolvedValue({
      authorizationState: 'context_authorized',
      executionAllowed: true,
      providerDispatchAccepted: true,
      providerExecutionProven: false,
      providerActionsRequested: 1,
      idempotencyKey: `founder-review:${receipt.ingressId}`,
    });
    const body = JSON.stringify(receipt);
    const signed = signedHeaders(body);

    const response = await request(app(store, processor))
      .post('/ingest/founder-review-email')
      .set('content-type', 'application/json')
      .set('x-founder-review-timestamp', signed.timestamp)
      .set('x-founder-review-signature', signed.signature)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accepted: true,
      duplicate: true,
      ingressId: receipt.ingressId,
      commandAuthorizationState: 'duplicate_no_redispatch',
      providerDispatchAccepted: false,
      providerExecutionProven: false,
      authorizedProviderActionsRequested: 0,
      idempotencyKey: null,
    });
    expect(store).toHaveBeenCalledOnce();
    expect(processor).not.toHaveBeenCalled();
  });
});
