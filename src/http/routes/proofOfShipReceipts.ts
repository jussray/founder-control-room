import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  normalizeProofOfShipReceiptId,
  ProofOfShipReceiptError,
  type ProofOfShipReceipt,
  validateProofOfShipReceipt,
} from '../../proofOfShip/receipt.js';

const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const RECEIPT_TOKEN_CONTEXT = 'founder-control-room/proof-of-ship-receipts/v1';

export type ProofOfShipReceiptStoreDisposition = 'stored' | 'duplicate' | 'conflict';

export interface ProofOfShipReceiptRepository {
  store(receipt: ProofOfShipReceipt): Promise<ProofOfShipReceiptStoreDisposition>;
  find(receiptId: string): Promise<ProofOfShipReceipt | null>;
  findByCommit(sourceRepo: string, exactCommitSha: string): Promise<ProofOfShipReceipt | null>;
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
  'buffer_publication_status',
  'buffer_post_id',
  'live_post_url',
  'published_at',
  'sms_notification_status',
  'sms_provider',
  'sms_message_id',
  'sms_delivered_at',
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

export function deriveProofOfShipReceiptToken(mcpToken: string): string {
  return createHmac('sha256', mcpToken)
    .update(RECEIPT_TOKEN_CONTEXT)
    .digest('hex');
}

function normalizeSourceRepo(owner: unknown, repo: unknown): string {
  if (owner !== 'jussray' || typeof repo !== 'string' || !REPO_NAME.test(repo)) {
    throw new ProofOfShipReceiptError('invalid_source_repo');
  }
  return `jussray/${repo}`;
}

function normalizeCommitSha(value: unknown): string {
  if (typeof value !== 'string' || !COMMIT_SHA.test(value)) {
    throw new ProofOfShipReceiptError('invalid_exact_commit_sha');
  }
  return value.toLowerCase();
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
      bufferPublicationStatus: row.buffer_publication_status,
      bufferPostId: row.buffer_post_id,
      livePostUrl: row.live_post_url,
      publishedAt: row.published_at,
      smsNotificationStatus: row.sms_notification_status,
      smsProvider: row.sms_provider,
      smsMessageId: row.sms_message_id,
      smsDeliveredAt: row.sms_delivered_at,
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
  return normalized ? JSON.stringify(normalized) === JSON.stringify(receipt) : false;
}

async function findReceipt(
  filters: { receiptId?: string; sourceRepo?: string; exactCommitSha?: string },
): Promise<ProofOfShipReceipt | null> {
  const { supabaseAdmin } = await import('../../lib/supabase.js');
  const admin = supabaseAdmin();
  let query = admin.from('proof_of_ship_receipts').select(RECEIPT_COLUMNS);

  if (filters.receiptId) query = query.eq('receipt_id', filters.receiptId);
  if (filters.sourceRepo) query = query.eq('source_repo', filters.sourceRepo);
  if (filters.exactCommitSha) query = query.eq('exact_commit_sha', filters.exactCommitSha);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('proof_of_ship_receipt_lookup_failed');
  return rowToProofOfShipReceipt(data);
}

export const proofOfShipReceiptRepository: ProofOfShipReceiptRepository = {
  find(receiptId) {
    return findReceipt({ receiptId });
  },

  findByCommit(sourceRepo, exactCommitSha) {
    return findReceipt({ sourceRepo, exactCommitSha });
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
      buffer_publication_status: receipt.bufferPublicationStatus,
      buffer_post_id: receipt.bufferPostId,
      live_post_url: receipt.livePostUrl,
      published_at: receipt.publishedAt,
      sms_notification_status: receipt.smsNotificationStatus,
      sms_provider: receipt.smsProvider,
      sms_message_id: receipt.smsMessageId,
      sms_delivered_at: receipt.smsDeliveredAt,
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
  const mcpToken = process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN?.trim();
  if (!mcpToken) {
    res.status(503).json({ error: 'Proof-of-ship receipt ingest is not configured' });
    return false;
  }

  const expectedToken = deriveProofOfShipReceiptToken(mcpToken);
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

export function createProofOfShipCommitLookupHandler(
  repository: ProofOfShipReceiptRepository = proofOfShipReceiptRepository,
): RequestHandler {
  return async function handleProofOfShipCommitLookup(req: Request, res: Response) {
    receiptHeaders(res);
    if (!authorize(req, res)) return;

    let sourceRepo: string;
    let exactCommitSha: string;
    try {
      sourceRepo = normalizeSourceRepo(req.params.owner, req.params.repo);
      exactCommitSha = normalizeCommitSha(req.params.sha);
    } catch (error) {
      const code = error instanceof ProofOfShipReceiptError ? error.code : 'invalid_receipt_lookup';
      return res.status(400).json({ error: code });
    }

    try {
      const receipt = await repository.findByCommit(sourceRepo, exactCommitSha);
      if (!receipt) {
        return res.status(404).json({ found: false, sourceRepo, exactCommitSha });
      }
      return res.status(200).json({ found: true, receipt });
    } catch {
      return res.status(503).json({ error: 'Receipt store unavailable' });
    }
  };
}

export const handleProofOfShipReceiptIngest = createProofOfShipReceiptIngestHandler();
export const handleProofOfShipReceiptLookup = createProofOfShipReceiptLookupHandler();
export const handleProofOfShipCommitLookup = createProofOfShipCommitLookupHandler();
