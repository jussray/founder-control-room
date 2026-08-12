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
const TEST_SECRET = 'test-review-email-ingress-secret-32-bytes';
const validReceipt = {
  version: 1,
  ingressId: 'ae4a3de8-c98c-52d0-af3a-8a4733c9142e',
  replyContextId: '45bb874d-69d4-4b32-8df2-c7934bb888c5',
  messageRefHash: 'a'.repeat(64),
  rawMessageHash: 'b'.repeat(64),
  senderRefHash: 'c'.repeat(64),
  recipientRefHash: 'd'.repeat(64),
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

function blockedProcessor(): FounderSignalReviewCommandProcessor {
  return vi.fn().mockResolvedValue({
    authorizationState: 'blocked_context_missing',
    executionAllowed: false,
    providerDispatchAccepted: false,
    providerExecutionProven: false,
    providerActionsRequested: 0,
    idempotencyKey: null,
  });
}

function createTestApp(
  store: FounderSignalReviewEmailReceiptStore,
  processor: FounderSignalReviewCommandProcessor = blockedProcessor(),
) {
  const app = express();
  app.post(
    '/ingest/founder-review-email',
    express.raw({ type: 'application/json', limit: '16kb' }),
    createFounderSignalReviewEmailIngestHandler(store, {
      now: () => nowMs,
      processor,
    }),
  );
  return app;
}

function sign(body: string, timestamp = String(nowMs), secret = TEST_SECRET) {
  const signature = createHmac('sha256', secret)
    .update(timestamp, 'utf8')
    .update('.', 'utf8')
    .update(body, 'utf8')
    .digest('hex');
  return { timestamp, signature };
}

async function postReceipt(
  store: FounderSignalReviewEmailReceiptStore,
  receipt: unknown = validReceipt,
  overrides: {
    timestamp?: string;
    signature?: string;
    body?: string;
    processor?: FounderSignalReviewCommandProcessor;
  } = {},
) {
  const body = overrides.body ?? JSON.stringify(receipt);
  const signed = sign(body, overrides.timestamp);
  return request(createTestApp(store, overrides.processor))
    .post('/ingest/founder-review-email')
    .set('content-type', 'application/json')
    .set('x-founder-review-timestamp', overrides.timestamp ?? signed.timestamp)
    .set('x-founder-review-signature', overrides.signature ?? signed.signature)
    .send(body);
}

describe('Founder Signal review email ingest', () => {
  const originalSecret = process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;

  beforeEach(() => {
    process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) {
      delete process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;
    } else {
      process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = originalSecret;
    }
  });

  it('stores one sanitized unresolved intake receipt before command resolution', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>().mockResolvedValue('stored');
    const response = await postReceipt(store);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      ingressId: validReceipt.ingressId,
      replyContextId: validReceipt.replyContextId,
      commandType: validReceipt.commandType,
      authorizationState: 'intake_only_unresolved',
      executionAllowed: false,
      providerActionsRequested: 0,
      commandAuthorizationState: 'blocked_context_missing',
      providerDispatchAccepted: false,
      providerExecutionProven: false,
      authorizedProviderActionsRequested: 0,
      idempotencyKey: null,
    });
    expect(JSON.stringify(response.body)).not.toContain(validReceipt.commandText);
    expect(store).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledWith(validReceipt);
  });

  it('reports provider dispatch separately from the immutable intake authority fields', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>().mockResolvedValue('stored');
    const processor = vi.fn<FounderSignalReviewCommandProcessor>().mockResolvedValue({
      authorizationState: 'context_authorized',
      executionAllowed: true,
      providerDispatchAccepted: true,
      providerExecutionProven: false,
      providerActionsRequested: 1,
      idempotencyKey: `founder-review:${validReceipt.ingressId}`,
    });
    const response = await postReceipt(store, validReceipt, { processor });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      authorizationState: 'intake_only_unresolved',
      executionAllowed: false,
      providerActionsRequested: 0,
      commandAuthorizationState: 'context_authorized',
      providerDispatchAccepted: true,
      providerExecutionProven: false,
      authorizedProviderActionsRequested: 1,
      idempotencyKey: `founder-review:${validReceipt.ingressId}`,
    });
    expect(processor).toHaveBeenCalledOnce();
    expect(processor).toHaveBeenCalledWith(validReceipt);
  });

  it('returns an idempotent unresolved duplicate receipt', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>().mockResolvedValue('duplicate');
    const response = await postReceipt(store);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      duplicate: true,
      authorizationState: 'intake_only_unresolved',
      executionAllowed: false,
      providerActionsRequested: 0,
    });
  });

  it('rejects missing, forged, and stale signatures before persistence', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>();
    const body = JSON.stringify(validReceipt);

    const missing = await request(createTestApp(store))
      .post('/ingest/founder-review-email')
      .set('content-type', 'application/json')
      .send(body);
    expect(missing.status).toBe(401);

    const forged = await postReceipt(store, validReceipt, { signature: 'f'.repeat(64) });
    expect(forged.status).toBe(401);

    const staleTimestamp = String(nowMs - 5 * 60 * 1000 - 1);
    const stale = await postReceipt(store, validReceipt, { timestamp: staleTimestamp });
    expect(stale.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects missing and weak ingress secrets', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>();

    delete process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;
    const missing = await postReceipt(store);
    expect(missing.status).toBe(503);

    process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = 'too-short';
    const weak = await postReceipt(store);
    expect(weak.status).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and unknown or private fields', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>();
    const malformed = await postReceipt(store, null, { body: '{' });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'invalid_json' });

    for (const privateField of [
      { rawEmail: 'private message' },
      { senderEmail: 'juss@example.com' },
      { recipientEmail: 'review@example.com' },
      { quotedHistory: 'private thread' },
      { attachment: 'base64-data' },
      { senderVerified: true },
    ]) {
      const response = await postReceipt(store, { ...validReceipt, ...privateField });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'unknown_or_private_field' });
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects authorization and provider-execution escalation in the signed intake body', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>();

    for (const mutation of [
      { providerActionsRequested: 1 },
      { executionAllowed: true },
      { authorizationState: 'authorized' },
      { senderAddressMatched: false },
    ]) {
      const response = await postReceipt(store, {
        ...validReceipt,
        ...mutation,
      });
      expect(response.status).toBe(400);
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects command semantic drift before persistence', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>();
    const response = await postReceipt(store, {
      ...validReceipt,
      commandType: 'cancel_one',
      commandText: 'juss_rayy_linkedin: publish now',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'command_semantics_mismatch' });
    expect(store).not.toHaveBeenCalled();
  });

  it('fails closed when the receipt store or provider dispatch path is unavailable', async () => {
    const failedStore = vi
      .fn<FounderSignalReviewEmailReceiptStore>()
      .mockRejectedValue(new Error('database unavailable'));
    const unavailable = await postReceipt(failedStore);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({
      error: 'Review email receipt store unavailable',
    });

    const store = vi.fn<FounderSignalReviewEmailReceiptStore>().mockResolvedValue('stored');
    const failedProcessor = vi.fn<FounderSignalReviewCommandProcessor>()
      .mockRejectedValue(new Error('provider unavailable'));
    const providerUnavailable = await postReceipt(store, validReceipt, {
      processor: failedProcessor,
    });
    expect(providerUnavailable.status).toBe(503);
    expect(providerUnavailable.body).toMatchObject({
      error: 'Review command dispatch unavailable',
      ingressId: validReceipt.ingressId,
      replyContextId: validReceipt.replyContextId,
    });
  });
});
