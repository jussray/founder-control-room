import { createHmac } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFounderSignalReviewEmailIngestHandler,
  type FounderSignalReviewEmailReceiptStore,
} from '../founderSignalReviewEmailIngress.js';

const nowMs = Date.parse('2026-08-02T21:05:00.000Z');
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
  senderVerified: true,
  providerActionsRequested: 0,
  receivedAt: '2026-08-02T21:05:00.000Z',
  source: 'cloudflare_email_routing',
} as const;

function createTestApp(store: FounderSignalReviewEmailReceiptStore) {
  const app = express();
  app.post(
    '/ingest/founder-review-email',
    express.raw({ type: 'application/json', limit: '16kb' }),
    createFounderSignalReviewEmailIngestHandler(store, { now: () => nowMs }),
  );
  return app;
}

function sign(body: string, timestamp = String(nowMs), secret = 'test-ingress-secret') {
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
  overrides: { timestamp?: string; signature?: string; body?: string } = {},
) {
  const body = overrides.body ?? JSON.stringify(receipt);
  const signed = sign(body, overrides.timestamp);
  return request(createTestApp(store))
    .post('/ingest/founder-review-email')
    .set('content-type', 'application/json')
    .set('x-founder-review-timestamp', overrides.timestamp ?? signed.timestamp)
    .set('x-founder-review-signature', overrides.signature ?? signed.signature)
    .send(body);
}

describe('Founder Signal review email ingest', () => {
  const originalSecret = process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;

  beforeEach(() => {
    process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = 'test-ingress-secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) {
      delete process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;
    } else {
      process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = originalSecret;
    }
  });

  it('stores one sanitized receipt and returns no raw command content', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>().mockResolvedValue('stored');
    const response = await postReceipt(store);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      ingressId: validReceipt.ingressId,
      replyContextId: validReceipt.replyContextId,
      commandType: validReceipt.commandType,
      providerActionsRequested: 0,
    });
    expect(JSON.stringify(response.body)).not.toContain(validReceipt.commandText);
    expect(store).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledWith(validReceipt);
  });

  it('returns an idempotent duplicate receipt', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>().mockResolvedValue('duplicate');
    const response = await postReceipt(store);

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
    expect(response.body.providerActionsRequested).toBe(0);
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
    ]) {
      const response = await postReceipt(store, { ...validReceipt, ...privateField });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'unknown_or_private_field' });
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects any request for provider execution', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>();
    const response = await postReceipt(store, {
      ...validReceipt,
      providerActionsRequested: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'provider_action_not_allowed' });
    expect(store).not.toHaveBeenCalled();
  });

  it('fails closed when the ingest secret or receipt store is unavailable', async () => {
    const store = vi.fn<FounderSignalReviewEmailReceiptStore>();
    delete process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET;
    const unconfigured = await postReceipt(store);
    expect(unconfigured.status).toBe(503);
    expect(store).not.toHaveBeenCalled();

    process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET = 'test-ingress-secret';
    const failedStore = vi
      .fn<FounderSignalReviewEmailReceiptStore>()
      .mockRejectedValue(new Error('database unavailable'));
    const unavailable = await postReceipt(failedStore);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({
      error: 'Review email receipt store unavailable',
    });
  });
});
