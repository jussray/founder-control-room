import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHairCommerceReceiptIngestHandler,
  storedHairCommerceReceiptMatches,
  type HairCommerceReceiptStore,
} from '../hairCommerceReceipts.js';

const validReceipt = {
  receiptId: '8fa23f1e-2844-4c65-a91a-e88bb91ecab4',
  sourceRepo: 'jussray/jbh-private',
  orderRefHash: 'a'.repeat(64),
  event: 'vendor_groups_ready',
  groupCount: 2,
  unresolvedCount: 0,
  occurredAt: '2026-08-02T19:30:00.000Z',
  exactCommitSha: 'b'.repeat(40),
  evidenceUrl: 'https://github.com/jussray/jbh-private/commit/' + 'b'.repeat(40),
} as const;

function createTestApp(store: HairCommerceReceiptStore) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.post('/ingest/hair-commerce-receipts', createHairCommerceReceiptIngestHandler(store));
  return app;
}

describe('hair commerce receipt ingest', () => {
  const originalToken = process.env.JBH_RECEIPT_INGEST_TOKEN;

  beforeEach(() => {
    process.env.JBH_RECEIPT_INGEST_TOKEN = 'test-secret-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.JBH_RECEIPT_INGEST_TOKEN;
    else process.env.JBH_RECEIPT_INGEST_TOKEN = originalToken;
  });

  it('rejects requests without the private ingest token', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .send(validReceipt);

    expect(response.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects vendor, customer, cost, and other unknown fields', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    const privateFields = [
      { vendorName: 'private-vendor' },
      { customerEmail: 'person@example.com' },
      { shippingAddress: 'private-address' },
      { wholesaleCost: 20 },
      { margin: 50 },
    ];

    for (const privateField of privateFields) {
      const response = await request(createTestApp(store))
        .post('/ingest/hair-commerce-receipts')
        .set('x-jbh-receipt-token', 'test-secret-token')
        .send({ ...validReceipt, ...privateField });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'unknown_or_private_field' });
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects evidence URLs from another repository', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send({
        ...validReceipt,
        evidenceUrl: 'https://github.com/other/private/commit/' + 'b'.repeat(40),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_evidence_url' });
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects evidence URLs for a different commit', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send({
        ...validReceipt,
        evidenceUrl: 'https://github.com/jussray/jbh-private/commit/' + 'c'.repeat(40),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_evidence_url' });
    expect(store).not.toHaveBeenCalled();
  });

  it('stores only the sanitized exact-head receipt', async () => {
    const store = vi.fn<HairCommerceReceiptStore>().mockResolvedValue('stored');
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send(validReceipt);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      receiptId: validReceipt.receiptId,
      event: validReceipt.event,
    });
    expect(store).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledWith(validReceipt);
  });

  it('returns an idempotent duplicate receipt without storing private data', async () => {
    const store = vi.fn<HairCommerceReceiptStore>().mockResolvedValue('duplicate');
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send(validReceipt);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: true,
      receiptId: validReceipt.receiptId,
      event: validReceipt.event,
    });
  });

  it('rejects receipt id reuse with a different immutable payload', async () => {
    const store = vi.fn<HairCommerceReceiptStore>().mockResolvedValue('conflict');
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send(validReceipt);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      accepted: false,
      error: 'receipt_id_conflict',
      receiptId: validReceipt.receiptId,
    });
    expect(response.body).not.toHaveProperty('event');
  });

  it('compares every immutable receipt field before classifying a duplicate', () => {
    const stored = {
      receipt_id: validReceipt.receiptId,
      source_repo: validReceipt.sourceRepo,
      order_ref_hash: validReceipt.orderRefHash,
      event_type: validReceipt.event,
      group_count: validReceipt.groupCount,
      unresolved_count: validReceipt.unresolvedCount,
      occurred_at: validReceipt.occurredAt,
      exact_commit_sha: validReceipt.exactCommitSha,
      evidence_url: validReceipt.evidenceUrl,
    };

    expect(storedHairCommerceReceiptMatches(stored, validReceipt)).toBe(true);

    const conflictingRows = [
      { ...stored, order_ref_hash: 'c'.repeat(64) },
      { ...stored, event_type: 'owner_approved' },
      { ...stored, group_count: 3 },
      { ...stored, unresolved_count: 1 },
      { ...stored, occurred_at: '2026-08-02T19:31:00.000Z' },
      { ...stored, exact_commit_sha: 'c'.repeat(40) },
      { ...stored, evidence_url: null },
    ];

    for (const conflicting of conflictingRows) {
      expect(storedHairCommerceReceiptMatches(conflicting, validReceipt)).toBe(false);
    }
  });

  it('fails closed when the ingest token is not configured', async () => {
    delete process.env.JBH_RECEIPT_INGEST_TOKEN;
    const store = vi.fn<HairCommerceReceiptStore>();
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send(validReceipt);

    expect(response.status).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });
});
