import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProofOfShipCommitLookupHandler,
  createProofOfShipReceiptIngestHandler,
  createProofOfShipReceiptLookupHandler,
  deriveProofOfShipReceiptToken,
  storedProofOfShipReceiptMatches,
  type ProofOfShipReceiptRepository,
} from '../proofOfShipReceipts.js';

const testMcpToken = 'test-founder-signal-engine-mcp-token';
const testReceiptToken = deriveProofOfShipReceiptToken(testMcpToken);

const validReceipt = {
  receiptId: '8fa23f1e-2844-4c65-a91a-e88bb91ecab4',
  source: 'zapier',
  sourceRepo: 'jussray/founder-control-room',
  exactCommitSha: 'b'.repeat(40),
  idempotencyKey: `jussray/founder-control-room:${'b'.repeat(40)}`,
  linkedinBaselineRef: 'linkedin-export:2026-08-02..2026-08-08',
  linkedinRisingFloorReady: true,
  linkedinGrowthHypothesis: 'Lead with a concrete execution conflict and verified mechanism.',
  linkedin24hGate: 'At least 150 impressions and 5% engagement rate after 24 hours.',
  linkedin48hGate: 'Beat the verified individual-post floor without engagement falling below 5%.',
  linkedinNextMutation: 'If distribution is weak but engagement holds, change the hook and format, not the proof.',
  linkedinDraftSha256: 'c'.repeat(64),
  bufferTerminalAction: 'schedule',
  bufferScheduleId: 'buffer:scheduled:12345',
  scheduledAt: '2026-08-08T06:40:00.000Z',
  occurredAt: '2026-08-08T06:20:00.000Z',
} as const;

function createRepository(): ProofOfShipReceiptRepository {
  return {
    store: vi.fn<ProofOfShipReceiptRepository['store']>().mockResolvedValue('stored'),
    find: vi.fn<ProofOfShipReceiptRepository['find']>().mockResolvedValue(null),
    findByCommit: vi.fn<ProofOfShipReceiptRepository['findByCommit']>().mockResolvedValue(null),
  };
}

function createTestApp(repository: ProofOfShipReceiptRepository) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.post('/ingest/proof-of-ship-receipts', createProofOfShipReceiptIngestHandler(repository));
  app.get(
    '/ingest/proof-of-ship-receipts/by-commit/:owner/:repo/:sha',
    createProofOfShipCommitLookupHandler(repository),
  );
  app.get('/ingest/proof-of-ship-receipts/:receiptId', createProofOfShipReceiptLookupHandler(repository));
  return app;
}

describe('proof-of-ship receipt ingest and lookup', () => {
  const originalMcpToken = process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN;

  beforeEach(() => {
    process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN = testMcpToken;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMcpToken === undefined) delete process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN;
    else process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN = originalMcpToken;
  });

  it('derives a narrow deterministic receipt token instead of accepting the MCP token directly', () => {
    expect(testReceiptToken).toMatch(/^[0-9a-f]{64}$/);
    expect(testReceiptToken).not.toBe(testMcpToken);
    expect(deriveProofOfShipReceiptToken(testMcpToken)).toBe(testReceiptToken);
    expect(deriveProofOfShipReceiptToken(`${testMcpToken}-other`)).not.toBe(testReceiptToken);
  });

  it('rejects receipt ingestion without the derived receipt token', async () => {
    const repository = createRepository();
    const missing = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .send(validReceipt);
    const broadSecret = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testMcpToken)
      .send(validReceipt);

    expect(missing.status).toBe(401);
    expect(broadSecret.status).toBe(401);
    expect(repository.store).not.toHaveBeenCalled();
  });

  it('rejects unknown fields so the receipt cannot become a content or private-data sink', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testReceiptToken)
      .send({ ...validReceipt, linkedinDraft: 'full post body must not be persisted here' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'unknown_or_private_field' });
    expect(repository.store).not.toHaveBeenCalled();
  });

  it('rejects a receipt until the rising-floor strategy is actually ready', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testReceiptToken)
      .send({ ...validReceipt, linkedinRisingFloorReady: false });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'linkedin_rising_floor_not_ready' });
  });

  it('rejects a receipt that is not bound to the exact repo and commit idempotency key', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testReceiptToken)
      .send({ ...validReceipt, idempotencyKey: `jussray/founder-control-room:${'d'.repeat(40)}` });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_idempotency_key' });
  });

  it('stores only the sanitized immutable receipt', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testReceiptToken)
      .send(validReceipt);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ accepted: true, duplicate: false, receiptId: validReceipt.receiptId });
    expect(repository.store).toHaveBeenCalledOnce();
    expect(repository.store).toHaveBeenCalledWith(validReceipt);
  });

  it('returns an idempotent duplicate receipt', async () => {
    const repository = createRepository();
    vi.mocked(repository.store).mockResolvedValue('duplicate');
    const response = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testReceiptToken)
      .send(validReceipt);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: true, duplicate: true, receiptId: validReceipt.receiptId });
  });

  it('rejects receipt-id reuse with a different immutable payload', async () => {
    const repository = createRepository();
    vi.mocked(repository.store).mockResolvedValue('conflict');
    const response = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testReceiptToken)
      .send(validReceipt);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ accepted: false, error: 'receipt_id_conflict', receiptId: validReceipt.receiptId });
  });

  it('requires the derived token for receipt-id lookup', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .get(`/ingest/proof-of-ship-receipts/${validReceipt.receiptId}`);

    expect(response.status).toBe(401);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('returns 404 until the downstream receipt exists', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .get(`/ingest/proof-of-ship-receipts/${validReceipt.receiptId}`)
      .set('x-proof-of-ship-receipt-token', testReceiptToken);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ found: false, receiptId: validReceipt.receiptId });
  });

  it('returns the sanitized downstream receipt for receipt-id verification', async () => {
    const repository = createRepository();
    vi.mocked(repository.find).mockResolvedValue(validReceipt);
    const response = await request(createTestApp(repository))
      .get(`/ingest/proof-of-ship-receipts/${validReceipt.receiptId}`)
      .set('x-proof-of-ship-receipt-token', testReceiptToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ found: true, receipt: validReceipt });
  });

  it('requires the derived token for exact-commit lookup', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .get(`/ingest/proof-of-ship-receipts/by-commit/jussray/founder-control-room/${validReceipt.exactCommitSha}`);

    expect(response.status).toBe(401);
    expect(repository.findByCommit).not.toHaveBeenCalled();
  });

  it('rejects an invalid exact-commit lookup target', async () => {
    const repository = createRepository();
    const badOwner = await request(createTestApp(repository))
      .get(`/ingest/proof-of-ship-receipts/by-commit/not-jussray/founder-control-room/${validReceipt.exactCommitSha}`)
      .set('x-proof-of-ship-receipt-token', testReceiptToken);
    const badSha = await request(createTestApp(repository))
      .get('/ingest/proof-of-ship-receipts/by-commit/jussray/founder-control-room/not-a-sha')
      .set('x-proof-of-ship-receipt-token', testReceiptToken);

    expect(badOwner.status).toBe(400);
    expect(badOwner.body).toEqual({ error: 'invalid_source_repo' });
    expect(badSha.status).toBe(400);
    expect(badSha.body).toEqual({ error: 'invalid_exact_commit_sha' });
    expect(repository.findByCommit).not.toHaveBeenCalled();
  });

  it('returns 404 until the exact commit has a downstream receipt', async () => {
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .get(`/ingest/proof-of-ship-receipts/by-commit/jussray/founder-control-room/${validReceipt.exactCommitSha}`)
      .set('x-proof-of-ship-receipt-token', testReceiptToken);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      found: false,
      sourceRepo: validReceipt.sourceRepo,
      exactCommitSha: validReceipt.exactCommitSha,
    });
    expect(repository.findByCommit).toHaveBeenCalledWith(validReceipt.sourceRepo, validReceipt.exactCommitSha);
  });

  it('returns the exact-commit receipt for post-deploy verification', async () => {
    const repository = createRepository();
    vi.mocked(repository.findByCommit).mockResolvedValue(validReceipt);
    const response = await request(createTestApp(repository))
      .get(`/ingest/proof-of-ship-receipts/by-commit/jussray/founder-control-room/${validReceipt.exactCommitSha}`)
      .set('x-proof-of-ship-receipt-token', testReceiptToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ found: true, receipt: validReceipt });
    expect(repository.findByCommit).toHaveBeenCalledWith(validReceipt.sourceRepo, validReceipt.exactCommitSha);
  });

  it('compares every immutable field before classifying a duplicate', () => {
    const stored = {
      receipt_id: validReceipt.receiptId,
      source_runtime: validReceipt.source,
      source_repo: validReceipt.sourceRepo,
      exact_commit_sha: validReceipt.exactCommitSha,
      idempotency_key: validReceipt.idempotencyKey,
      linkedin_baseline_ref: validReceipt.linkedinBaselineRef,
      linkedin_rising_floor_ready: validReceipt.linkedinRisingFloorReady,
      linkedin_growth_hypothesis: validReceipt.linkedinGrowthHypothesis,
      linkedin_24h_gate: validReceipt.linkedin24hGate,
      linkedin_48h_gate: validReceipt.linkedin48hGate,
      linkedin_next_mutation: validReceipt.linkedinNextMutation,
      linkedin_draft_sha256: validReceipt.linkedinDraftSha256,
      buffer_terminal_action: validReceipt.bufferTerminalAction,
      buffer_schedule_id: validReceipt.bufferScheduleId,
      scheduled_at: validReceipt.scheduledAt,
      occurred_at: validReceipt.occurredAt,
    };

    expect(storedProofOfShipReceiptMatches(stored, validReceipt)).toBe(true);
    expect(storedProofOfShipReceiptMatches({ ...stored, buffer_schedule_id: 'buffer:other' }, validReceipt)).toBe(false);
    expect(storedProofOfShipReceiptMatches({ ...stored, linkedin_baseline_ref: 'linkedin-export:other' }, validReceipt)).toBe(false);
    expect(storedProofOfShipReceiptMatches({ ...stored, exact_commit_sha: 'd'.repeat(40) }, validReceipt)).toBe(false);
  });

  it('fails closed when the existing MCP secret is not configured', async () => {
    delete process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN;
    const repository = createRepository();
    const response = await request(createTestApp(repository))
      .post('/ingest/proof-of-ship-receipts')
      .set('x-proof-of-ship-receipt-token', testReceiptToken)
      .send(validReceipt);

    expect(response.status).toBe(503);
    expect(repository.store).not.toHaveBeenCalled();
  });
});
