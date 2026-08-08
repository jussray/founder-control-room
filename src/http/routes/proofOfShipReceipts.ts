import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  normalizeProofOfShipReceiptId,
  ProofOfShipReceiptError,
  type ProofOfShipReceipt,
  validateProofOfShipReceipt,
} from '../../proofOfShip/receipt.js';

export type ProofOfShipReceiptStoreDisposition = 'stored' | 'duplicate' | 'conflict';

export interface ProofOfShipReceiptRepository {
  store(receipt: ProofOfShipReceipt): Promise<ProofOfShipReceiptStoreDisposition>;
  find(receiptId: string): Promise<ProofOfShipReceipt | null>;
}

const RECEIPT_COLUMNS = [
  'receipt_id',
  'source_runtime',
  'source_repo',
  'exact_commit_sha',
  'idempotency_key',
  'linkedin_baseline_ref',
  'linkedin_rising_floor_ready',
  'linkedin_growth_hypothesis',
  'linkedin_24h_gate',
  'linkedin_48h_gate',
  'linkedin_next_mutation',
  'linkedin_draft_sha256',
  'buffer_terminal_action',
  'buffer_schedule_id',
  'scheduled_at',
  'occurred_at',
].join(',');

type StoredReceipt = Record<string, unknown>;

function isRecord(value: unknown): value is StoredReceipt {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeToken(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const left = safeToken(provided);
  const right = safeToken(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function rowToProofOfShipReceipt(row: unknown): ProofOfShipReceipt | null {
  if (!isRecord(row)) return null;

  try {
    return validateProofOfShipReceipt({
      receiptId: row.receipt_id,
      source: row.source_runtime,
      sourceRepo: row.source_repo,
      exactCommitSha: row.exact_commit_sha,
      idempotencyKey: row.idempotency_key,
      linkedinBaselineRef: row.linkedin_baseline_ref,
      linkedinRisingFloorReady: row.linkedin_rising_floor_ready,
      linkedinGrowthHypothesis: row.linkedin_growth_hypothesis,
      linkedin24hGate: row.linkedin_24h_gate,
      linkedin48hGate: row.linkedin_48h_gate,
      linkedinNextMutation: row.linkedin_next_mutation,
      linkedinDraftSha256: row.linkedin_draft_sha256,
      bufferTerminalAction: row.buffer_terminal_action,
      bufferScheduleId: row.buffer_schedule_id,
      scheduledAt: row.scheduled_at,
      occurredAt: row.occurred_at,
    });
  } catch {
    return null;
  }
}

export function storedProofOfShipReceiptMatches(
  stored: unknown,
  receipt: ProofOfShipReceipt,
): boolean {
  const normalized = rowToProofOfShipReceipt(stored);
  if (!normalized) return false;
  return JSON.stringify(normalized) === JSON.stringify(receipt);
}

export const proofOfShipReceiptRepository: ProofOfShipReceiptRepository = {
  async find(receiptId) {
    const { supabaseAdmin } = await import('../../lib/supabase.js');
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('proof_of_ship_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('receipt_id', receiptId)
      .maybeSingle();

    if (error) throw new Error('proof_of_ship_receipt_lookup_failed');
    return rowToProofOfShipReceipt(data);
  },

  async store(receipt) {
    const existing = await this.find(receipt.receiptId);
    if (existing) {
      return JSON.stringify(existing) === JSON.stringify(receipt) ? 'duplicate' : 'conflict';
    }

    const { supabaseAdmin } = await import('../../lib/supabase.js');
    const admin = supabaseAdmin();
    const { error } = await admin.from('proof_of_ship_receipts').insert({
      receipt_id: receipt.receiptId,
      source_runtime: receipt.source,
      source_repo: receipt.sourceRepo,
      exact_commit_sha: receipt.exactCommitSha,
      idempotency_key: receipt.idempotencyKey,
      linkedin_baseline_ref: receipt.linkedinBaselineRef,
      linkedin_rising_floor_ready: receipt.linkedinRisingFloorReady,
      linkedin_growth_hypothesis: receipt.linkedinGrowthHypothesis,
      linkedin_24h_gate: receipt.linkedin24hGate,
      linkedin_48h_gate: receipt.linkedin48hGate,
      linkedin_next_mutation: receipt.linkedinNextMutation,
      linkedin_draft_sha256: receipt.linkedinDraftSha256,
      buffer_terminal_action: receipt.bufferTerminalAction,
      buffer_schedule_id: receipt.bufferScheduleId,
      scheduled_at: receipt.scheduledAt,
      occurred_at: receipt.occurredAt,
    });

    if (!error) return 'stored';
    if ((error as { code?: string }).code !== '23505') {
      throw new Error('proof_of_ship_receipt_store_failed');
    }

    const raced = await this.find(receipt.receiptId);
    if (!raced) throw new Error('proof_of_ship_receipt_store_failed');
    return JSON.stringify(raced) === JSON.stringify(receipt) ? 'duplicate' : 'conflict';
  },
};

function receiptHeaders(res: Response) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function authorize(req: Request, res: Response): boolean {
  const expectedToken = process.env.PROOF_OF_SHIP_RECEIPT_TOKEN?.trim();
  if (!expectedToken) {
    res.status(503).json({ error: 'Proof-of-ship receipt ingest is not configured' });
    return false;
  }

  const provided = req.get('x-proof-of-ship-receipt-token');
  if (!tokenMatches(provided, expectedToken)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function createProofOfShipReceiptIngestHandler(
  repository: ProofOfShipReceiptRepository = proofOfShipReceiptRepository,
): RequestHandler {
  return async function handleProofOfShipReceiptIngest(req: Request, res: Response) {
    receiptHeaders(res);
    if (!authorize(req, res)) return;

    let receipt: ProofOfShipReceipt;
    try {
      receipt = validateProofOfShipReceipt(req.body);
    } catch (error) {
      const code = error instanceof ProofOfShipReceiptError ? error.code : 'invalid_receipt';
      return res.status(400).json({ error: code });
    }

    try {
      const disposition = await repository.store(receipt);
      if (disposition === 'conflict') {
        return res.status(409).json({
          accepted: false,
          error: 'receipt_id_conflict',
          receiptId: receipt.receiptId,
        });
      }

      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        receiptId: receipt.receiptId,
      });
    } catch {
      return res.status(503).json({ error: 'Receipt store unavailable' });
    }
  };
}

export function createProofOfShipReceiptLookupHandler(
  repository: ProofOfShipReceiptRepository = proofOfShipReceiptRepository,
): RequestHandler {
  return async function handleProofOfShipReceiptLookup(req: Request, res: Response) {
    receiptHeaders(res);
    if (!authorize(req, res)) return;

    let receiptId: string;
    try {
      receiptId = normalizeProofOfShipReceiptId(req.params.receiptId);
    } catch (error) {
      const code = error instanceof ProofOfShipReceiptError ? error.code : 'invalid_receipt_id';
      return res.status(400).json({ error: code });
    }

    try {
      const receipt = await repository.find(receiptId);
      if (!receipt) return res.status(404).json({ found: false, receiptId });
      return res.status(200).json({ found: true, receipt });
    } catch {
      return res.status(503).json({ error: 'Receipt store unavailable' });
    }
  };
}

export const handleProofOfShipReceiptIngest = createProofOfShipReceiptIngestHandler();
export const handleProofOfShipReceiptLookup = createProofOfShipReceiptLookupHandler();
