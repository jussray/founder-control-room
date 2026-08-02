import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { supabaseAdmin } from '../../lib/supabase.js';
import {
  HairCommerceReceiptError,
  type HairCommerceReceipt,
  validateHairCommerceReceipt,
} from '../../hairCommerce/receipt.js';

export type HairCommerceReceiptStore = (
  receipt: HairCommerceReceipt,
) => Promise<'stored' | 'duplicate'>;

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

export const persistHairCommerceReceipt: HairCommerceReceiptStore = async (receipt) => {
  const { data, error } = await supabaseAdmin()
    .from('hair_commerce_receipts')
    .upsert(
      {
        receipt_id: receipt.receiptId,
        source_repo: receipt.sourceRepo,
        order_ref_hash: receipt.orderRefHash,
        event_type: receipt.event,
        group_count: receipt.groupCount,
        unresolved_count: receipt.unresolvedCount,
        occurred_at: receipt.occurredAt,
        exact_commit_sha: receipt.exactCommitSha,
        evidence_url: receipt.evidenceUrl ?? null,
      },
      { onConflict: 'receipt_id', ignoreDuplicates: true },
    )
    .select('receipt_id');

  if (error) throw new Error('hair_commerce_receipt_store_failed');
  return data && data.length > 0 ? 'stored' : 'duplicate';
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
