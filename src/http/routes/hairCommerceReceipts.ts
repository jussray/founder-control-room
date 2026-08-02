import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  HairCommerceReceiptError,
  type HairCommerceReceipt,
  validateHairCommerceReceipt,
} from '../../hairCommerce/receipt.js';

export type HairCommerceReceiptStoreDisposition = 'stored' | 'duplicate' | 'conflict';

export type HairCommerceReceiptStore = (
  receipt: HairCommerceReceipt,
) => Promise<HairCommerceReceiptStoreDisposition>;

const RECEIPT_COLUMNS = [
  'receipt_id',
  'source_repo',
  'order_ref_hash',
  'event_type',
  'group_count',
  'unresolved_count',
  'occurred_at',
  'exact_commit_sha',
  'evidence_url',
].join(',');

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function storedHairCommerceReceiptMatches(
  stored: unknown,
  receipt: HairCommerceReceipt,
): boolean {
  if (!isRecord(stored)) return false;

  return (
    stored.receipt_id === receipt.receiptId &&
    stored.source_repo === receipt.sourceRepo &&
    stored.order_ref_hash === receipt.orderRefHash &&
    stored.event_type === receipt.event &&
    stored.group_count === receipt.groupCount &&
    stored.unresolved_count === receipt.unresolvedCount &&
    stored.occurred_at === receipt.occurredAt &&
    stored.exact_commit_sha === receipt.exactCommitSha &&
    (stored.evidence_url ?? null) === (receipt.evidenceUrl ?? null)
  );
}

export const persistHairCommerceReceipt: HairCommerceReceiptStore = async (receipt) => {
  // Keep the service-role dependency behind the real persistence path. This
  // lets injected-store tests execute without production Supabase bindings and
  // still fails closed when the live route actually needs persistence.
  const { supabaseAdmin } = await import('../../lib/supabase.js');
  const admin = supabaseAdmin();

  const readExisting = async (): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('hair_commerce_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('receipt_id', receipt.receiptId)
      .maybeSingle();

    if (error) throw new Error('hair_commerce_receipt_lookup_failed');
    return isRecord(data) ? data : null;
  };

  const existing = await readExisting();
  if (existing) {
    return storedHairCommerceReceiptMatches(existing, receipt) ? 'duplicate' : 'conflict';
  }

  const { error: insertError } = await admin.from('hair_commerce_receipts').insert({
    receipt_id: receipt.receiptId,
    source_repo: receipt.sourceRepo,
    order_ref_hash: receipt.orderRefHash,
    event_type: receipt.event,
    group_count: receipt.groupCount,
    unresolved_count: receipt.unresolvedCount,
    occurred_at: receipt.occurredAt,
    exact_commit_sha: receipt.exactCommitSha,
    evidence_url: receipt.evidenceUrl ?? null,
  });

  if (!insertError) return 'stored';
  if ((insertError as { code?: string }).code !== '23505') {
    throw new Error('hair_commerce_receipt_store_failed');
  }

  // A concurrent request may win the insert race. Treat it as idempotent only
  // when every immutable field matches the already persisted receipt.
  const racedExisting = await readExisting();
  if (!racedExisting) throw new Error('hair_commerce_receipt_store_failed');
  return storedHairCommerceReceiptMatches(racedExisting, receipt) ? 'duplicate' : 'conflict';
};

export function createHairCommerceReceiptIngestHandler(
  store: HairCommerceReceiptStore = persistHairCommerceReceipt,
): RequestHandler {
  return async function handleHairCommerceReceiptIngest(
    req: Request,
    res: Response,
  ) {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });

    const expectedToken = process.env.JBH_RECEIPT_INGEST_TOKEN?.trim();
    if (!expectedToken) {
      return res.status(503).json({ error: 'Receipt ingest is not configured' });
    }

    const provided = req.get('x-jbh-receipt-token');
    if (!tokenMatches(provided, expectedToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let receipt: HairCommerceReceipt;
    try {
      receipt = validateHairCommerceReceipt(req.body);
    } catch (error) {
      const code =
        error instanceof HairCommerceReceiptError ? error.code : 'invalid_receipt';
      return res.status(400).json({ error: code });
    }

    try {
      const disposition = await store(receipt);
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
        event: receipt.event,
      });
    } catch {
      return res.status(503).json({ error: 'Receipt store unavailable' });
    }
  };
}

export const handleHairCommerceReceiptIngest =
  createHairCommerceReceiptIngestHandler();
