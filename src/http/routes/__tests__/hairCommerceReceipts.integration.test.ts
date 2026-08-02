import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHairCommerceReceiptIngestHandler,
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

  it('rejects evidence from another repository or another commit', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    const mismatches = [
      'https://github.com/other/private/commit/' + validReceipt.exactCommitSha,
      'https://github.com/jussray/jbh-private/commit/' + 'c'.repeat(40),
      validReceipt.evidenceUrl + '?untrusted=1',
      validReceipt.evidenceUrl + '#fragment',
    ];

    for (const evidenceUrl of mismatches) {
      const response = await request(createTestApp(store))
        .post('/ingest/hair-commerce-receipts')
        .set('x-jbh-receipt-token', 'test-secret-token')
        .send({ ...validReceipt, evidenceUrl });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'evidence_url_mismatch' });
    }
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

  it('returns an idempotent duplicate only for an identical receipt replay', async () => {
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

  it('rejects receipt-ID reuse with a different immutable payload', async () => {
    const store = vi.fn<HairCommerceReceiptStore>().mockResolvedValue('conflict');
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send({ ...validReceipt, event: 'owner_approved' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      accepted: false,
      duplicate: false,
      error: 'receipt_id_payload_conflict',
      receiptId: validReceipt.receiptId,
    });
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
