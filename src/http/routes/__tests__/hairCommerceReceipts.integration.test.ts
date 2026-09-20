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

const paidReceipt = {
  ...validReceipt,
  receiptId: '6a0a94b5-1590-4ca3-b4d6-b0a7a5f96b13',
  event: 'paid_order_recorded',
  groupCount: 0,
  collectedValueCents: 25_00,
  currency: 'USD',
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

  it('requires collected value and currency for paid-order evidence', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    for (const incomplete of [
      { ...paidReceipt, collectedValueCents: undefined },
      { ...paidReceipt, currency: undefined },
      { ...paidReceipt, collectedValueCents: 0 },
      { ...paidReceipt, currency: 'EUR' },
    ]) {
      const response = await request(createTestApp(store))
        .post('/ingest/hair-commerce-receipts')
        .set('x-jbh-receipt-token', 'test-secret-token')
        .send(incomplete);
      expect(response.status).toBe(400);
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects money fields on non-payment lifecycle receipts', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send({ ...validReceipt, collectedValueCents: 2500, currency: 'USD' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'money_fields_not_allowed_for_event' });
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects evidence URLs from another repository or commit', async () => {
    const store = vi.fn<HairCommerceReceiptStore>();
    for (const evidenceUrl of [
      'https://github.com/other/private/commit/' + 'b'.repeat(40),
      'https://github.com/jussray/jbh-private/commit/' + 'c'.repeat(40),
    ]) {
      const response = await request(createTestApp(store))
        .post('/ingest/hair-commerce-receipts')
        .set('x-jbh-receipt-token', 'test-secret-token')
        .send({ ...validReceipt, evidenceUrl });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'invalid_evidence_url' });
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('stores only the sanitized exact-head lifecycle receipt', async () => {
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
      revenueState: null,
    });
    expect(store).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledWith(validReceipt);
  });

  it('maps a paid receipt to payment_collected without trusting sender revenue state', async () => {
    const store = vi.fn<HairCommerceReceiptStore>().mockResolvedValue('stored');
    const response = await request(createTestApp(store))
      .post('/ingest/hair-commerce-receipts')
      .set('x-jbh-receipt-token', 'test-secret-token')
      .send(paidReceipt);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      receiptId: paidReceipt.receiptId,
      event: paidReceipt.event,
      revenueState: 'payment_collected',
    });
    expect(store).toHaveBeenCalledWith(paidReceipt);
  });

  it('returns an idempotent duplicate receipt', async () => {
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
      revenueState: null,
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
  });

  it('compares every immutable receipt field before classifying a duplicate', () => {
    const stored = {
      receipt_id: paidReceipt.receiptId,
      source_repo: paidReceipt.sourceRepo,
      order_ref_hash: paidReceipt.orderRefHash,
      event_type: paidReceipt.event,
      group_count: paidReceipt.groupCount,
      unresolved_count: paidReceipt.unresolvedCount,
      occurred_at: paidReceipt.occurredAt,
      exact_commit_sha: paidReceipt.exactCommitSha,
      collected_value_cents: paidReceipt.collectedValueCents,
      currency: paidReceipt.currency,
      revenue_state: 'payment_collected',
      evidence_url: paidReceipt.evidenceUrl,
    };

    expect(storedHairCommerceReceiptMatches(stored, paidReceipt)).toBe(true);

    const conflictingRows = [
      { ...stored, order_ref_hash: 'c'.repeat(64) },
      { ...stored, collected_value_cents: 2600 },
      { ...stored, currency: null },
      { ...stored, revenue_state: null },
      { ...stored, exact_commit_sha: 'c'.repeat(40) },
      { ...stored, evidence_url: null },
    ];

    for (const conflicting of conflictingRows) {
      expect(storedHairCommerceReceiptMatches(conflicting, paidReceipt)).toBe(false);
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
